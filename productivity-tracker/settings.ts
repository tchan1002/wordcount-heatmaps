import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import ProductivityTrackerPlugin from "./main";
import { ProductivityTrackerSettings } from "./types";

export class ProductivityTrackerSettingTab extends PluginSettingTab {
  plugin: ProductivityTrackerPlugin;

  constructor(app: App, plugin: ProductivityTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Productivity Tracker Settings" });

    // Tracking folder setting
    new Setting(containerEl)
      .setName("Tracking folder")
      .setDesc(
        "Path to the folder containing your daily notes (e.g., '100 days' or 'Journal/Daily'). Only files in this folder will be tracked."
      )
      .addText((text) => {
        text
          .setPlaceholder("Enter folder path...")
          .setValue(this.plugin.settings.trackingFolder)
          .onChange(async (value) => {
            // Remove leading/trailing slashes
            const normalizedPath = value.replace(/^\/|\/$/g, "");
            this.plugin.settings.trackingFolder = normalizedPath;
            await this.plugin.saveSettings();

            // Validate folder exists
            this.validateFolder(normalizedPath, text.inputEl);
          });

        // Initial validation
        this.validateFolder(this.plugin.settings.trackingFolder, text.inputEl);

        return text;
      });

    // Folder validation message container
    const folderValidation = containerEl.createDiv({
      cls: "productivity-tracker-folder-validation",
    });
    folderValidation.id = "folder-validation";

    // Lookback window setting
    new Setting(containerEl)
      .setName("Lookback window")
      .setDesc("Number of days to include in trend calculations")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("7", "7 days")
          .addOption("14", "14 days")
          .addOption("30", "30 days")
          .addOption("90", "90 days")
          .setValue(this.plugin.settings.lookbackWindow.toString())
          .onChange(async (value) => {
            this.plugin.settings.lookbackWindow = parseInt(value);
            await this.plugin.saveSettings();
          });
      });

    // Auto-expand panel setting
    new Setting(containerEl)
      .setName("Auto-expand panel")
      .setDesc("Automatically expand the panel on the first save of each day")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoExpandPanel)
          .onChange(async (value) => {
            this.plugin.settings.autoExpandPanel = value;
            await this.plugin.saveSettings();
          });
      });

    // Data management section
    containerEl.createEl("h3", { text: "Data Management" });

    // Clear data button
    new Setting(containerEl)
      .setName("Clear all data")
      .setDesc("Remove all tracked productivity data. This cannot be undone.")
      .addButton((button) => {
        button
          .setButtonText("Clear Data")
          .setWarning()
          .onClick(async () => {
            const confirmed = await this.confirmClearData();
            if (confirmed) {
              await this.plugin.clearAllData();
            }
          });
      });

    // Export data button
    new Setting(containerEl)
      .setName("Export data")
      .setDesc("Export productivity data as JSON file")
      .addButton((button) => {
        button.setButtonText("Export").onClick(async () => {
          await this.plugin.exportData();
        });
      });
  }

  /**
   * Validate that the folder exists
   */
  private validateFolder(path: string, inputEl: HTMLInputElement): void {
    const validationEl = document.getElementById("folder-validation");
    if (!validationEl) return;

    if (!path) {
      validationEl.textContent = "Please enter a folder path to start tracking.";
      validationEl.classList.add("is-warning");
      validationEl.classList.remove("is-error", "is-success");
      inputEl.classList.remove("is-invalid");
      return;
    }

    const folder = this.app.vault.getAbstractFileByPath(path);

    if (folder instanceof TFolder) {
      validationEl.textContent = `✓ Folder found: ${folder.path}`;
      validationEl.classList.add("is-success");
      validationEl.classList.remove("is-error", "is-warning");
      inputEl.classList.remove("is-invalid");
    } else {
      validationEl.textContent = `✗ Folder not found: "${path}"`;
      validationEl.classList.add("is-error");
      validationEl.classList.remove("is-success", "is-warning");
      inputEl.classList.add("is-invalid");
    }
  }

  /**
   * Show confirmation dialog for clearing data
   */
  private async confirmClearData(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.classList.add("modal-container");
      modal.innerHTML = `
        <div class="modal-bg"></div>
        <div class="modal">
          <div class="modal-title">Clear All Data</div>
          <div class="modal-content">
            <p>Are you sure you want to clear all productivity tracking data?</p>
            <p>This action cannot be undone.</p>
          </div>
          <div class="modal-button-container">
            <button class="mod-cta" id="confirm-clear">Clear Data</button>
            <button id="cancel-clear">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const confirmBtn = modal.querySelector("#confirm-clear") as HTMLButtonElement;
      const cancelBtn = modal.querySelector("#cancel-clear") as HTMLButtonElement;
      const bg = modal.querySelector(".modal-bg") as HTMLElement;

      const cleanup = () => {
        modal.remove();
      };

      confirmBtn.addEventListener("click", () => {
        cleanup();
        resolve(true);
      });

      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolve(false);
      });

      bg.addEventListener("click", () => {
        cleanup();
        resolve(false);
      });
    });
  }
}
