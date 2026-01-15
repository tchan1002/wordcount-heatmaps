import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { DataTracker } from "./data-tracker";
import { PanelView } from "./panel-view";
import { ProductivityTrackerSettingTab } from "./settings";
import {
  DEFAULT_DATA,
  DEFAULT_SETTINGS,
  PluginData,
  ProductivityTrackerSettings,
} from "./types";

export default class ProductivityTrackerPlugin extends Plugin {
  settings: ProductivityTrackerSettings = DEFAULT_SETTINGS;
  private data: PluginData = DEFAULT_DATA;
  private dataTracker: DataTracker | null = null;
  private panelView: PanelView | null = null;
  private activeView: MarkdownView | null = null;

  async onload() {
    console.log("Loading Productivity Tracker plugin");

    // Load saved data
    await this.loadPluginData();

    // Initialize data tracker
    this.dataTracker = new DataTracker(this.data, this.app.vault, () =>
      this.savePluginData()
    );

    // Initialize panel view
    this.panelView = new PanelView(this.dataTracker, this.settings, (collapsed) => {
      this.settings.panelCollapsed = collapsed;
      this.savePluginData();
    });

    // Add settings tab
    this.addSettingTab(new ProductivityTrackerSettingTab(this.app, this));

    // Register event handlers
    this.registerEventHandlers();

    // Register commands
    this.registerCommands();

    // Attach panel to current view if applicable
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      this.handleActiveLeafChange(activeView);
    }
  }

  onunload() {
    console.log("Unloading Productivity Tracker plugin");
    this.panelView?.detach();
  }

  /**
   * Register all event handlers
   */
  private registerEventHandlers(): void {
    // Handle file modifications (save events)
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!(file instanceof TFile)) return;

        const result = await this.dataTracker?.processFileModification(file);
        if (result) {
          // Refresh the panel
          this.panelView?.refresh();

          // Auto-expand on first save of the day
          if (result.isFirstSaveOfDay && this.settings.autoExpandPanel) {
            this.panelView?.expand();
          }
        }
      })
    );

    // Handle active leaf changes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const view = leaf?.view;
        if (view instanceof MarkdownView) {
          this.handleActiveLeafChange(view);
        } else {
          this.panelView?.detach();
          this.activeView = null;
        }
      })
    );

    // Handle file open (initialize word count cache)
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof TFile) {
          await this.dataTracker?.initializeFileCache(file);
        }
      })
    );

    // Handle layout changes (resize)
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.panelView?.refresh();
      })
    );
  }

  /**
   * Handle active leaf change
   */
  private handleActiveLeafChange(view: MarkdownView): void {
    const file = view.file;

    // Check if file is in tracked folder
    if (
      file &&
      this.dataTracker &&
      this.dataTracker["isFileInTrackedFolder"](file, this.settings.trackingFolder)
    ) {
      // Attach panel if not already attached to this view
      if (this.activeView !== view) {
        this.activeView = view;
        // Get the date from the filename to display that day's data
        const fileDate = this.dataTracker.getDateFromFile(file);
        this.panelView?.attach(view, fileDate);
      }
    } else {
      // Detach panel if file is not in tracked folder
      this.panelView?.detach();
      this.activeView = null;
    }
  }

  /**
   * Register commands
   */
  private registerCommands(): void {
    this.addCommand({
      id: "show-today-pattern",
      name: "Show today's pattern",
      callback: () => {
        this.panelView?.setView("today");
        this.panelView?.expand();
        new Notice("Showing today's writing pattern");
      },
    });

    this.addCommand({
      id: "show-trend",
      name: `Show ${this.settings.lookbackWindow}-day trend`,
      callback: () => {
        this.panelView?.setView("trend");
        this.panelView?.expand();
        new Notice(`Showing ${this.settings.lookbackWindow}-day trend`);
      },
    });

    this.addCommand({
      id: "toggle-panel",
      name: "Toggle panel",
      callback: () => {
        if (this.panelView?.isAttached()) {
          const container = document.querySelector(".productivity-tracker-panel");
          if (container) {
            container.classList.toggle("is-collapsed");
            this.settings.panelCollapsed = container.classList.contains("is-collapsed");
            this.savePluginData();
          }
        }
      },
    });

    this.addCommand({
      id: "refresh-data",
      name: "Refresh data",
      callback: () => {
        this.panelView?.refresh();
        new Notice("Productivity data refreshed");
      },
    });
  }

  /**
   * Load plugin data from storage
   */
  private async loadPluginData(): Promise<void> {
    const savedData = await this.loadData();
    if (savedData) {
      this.data = { ...DEFAULT_DATA, ...savedData };
      this.settings = { ...DEFAULT_SETTINGS, ...savedData.settings };
      this.data.settings = this.settings;
    }
  }

  /**
   * Save plugin data to storage
   */
  private async savePluginData(): Promise<void> {
    this.data.settings = this.settings;
    await this.saveData(this.data);
  }

  /**
   * Save settings
   */
  async saveSettings(): Promise<void> {
    await this.savePluginData();
    // Update panel view with new settings
    this.panelView?.updateSettings(this.settings);
  }

  /**
   * Clear all tracking data
   */
  async clearAllData(): Promise<void> {
    this.data.dailyData = {};
    this.data.wordCountCache = {};
    this.data.lastSaveTime = {};
    await this.savePluginData();
    this.panelView?.refresh();
    new Notice("All productivity data cleared");
  }

  /**
   * Export data as JSON
   */
  async exportData(): Promise<void> {
    const exportData = {
      dailyData: this.data.dailyData,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productivity-tracker-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    new Notice("Data exported successfully");
  }
}
