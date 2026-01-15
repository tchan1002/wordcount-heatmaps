import { MarkdownView } from "obsidian";
import { ChartRenderer, ChartView } from "./chart-renderer";
import { DataTracker } from "./data-tracker";
import { ProductivityTrackerSettings } from "./types";

export class PanelView {
  private container: HTMLElement | null = null;
  private chartContainer: HTMLElement | null = null;
  private chartRenderer: ChartRenderer;
  private dataTracker: DataTracker;
  private settings: ProductivityTrackerSettings;
  private currentView: ChartView = "today";
  private isCollapsed: boolean;
  private onSettingsChange: (collapsed: boolean) => void;

  constructor(
    dataTracker: DataTracker,
    settings: ProductivityTrackerSettings,
    onSettingsChange: (collapsed: boolean) => void
  ) {
    this.chartRenderer = new ChartRenderer();
    this.dataTracker = dataTracker;
    this.settings = settings;
    this.isCollapsed = settings.panelCollapsed;
    this.onSettingsChange = onSettingsChange;
  }

  /**
   * Attach panel to a markdown view
   */
  attach(view: MarkdownView): void {
    // Remove existing panel if any
    this.detach();

    // Get the content container
    const contentEl = view.contentEl;
    if (!contentEl) return;

    // Create panel container
    this.container = document.createElement("div");
    this.container.classList.add("productivity-tracker-panel");
    if (this.isCollapsed) {
      this.container.classList.add("is-collapsed");
    }

    // Create header
    const header = this.createHeader();
    this.container.appendChild(header);

    // Create content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("productivity-tracker-content");

    // Create controls
    const controls = this.createControls();
    contentWrapper.appendChild(controls);

    // Create chart container
    this.chartContainer = document.createElement("div");
    this.chartContainer.classList.add("productivity-tracker-chart-container");
    contentWrapper.appendChild(this.chartContainer);

    this.container.appendChild(contentWrapper);

    // Append to view
    contentEl.appendChild(this.container);

    // Render initial chart
    this.renderChart();
  }

  /**
   * Detach panel from view
   */
  detach(): void {
    this.chartRenderer.destroy();
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.chartContainer = null;
    }
  }

  /**
   * Create panel header
   */
  private createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.classList.add("productivity-tracker-header");

    const title = document.createElement("span");
    title.classList.add("productivity-tracker-title");
    title.textContent = "Productivity Tracker";

    const toggleBtn = document.createElement("button");
    toggleBtn.classList.add("productivity-tracker-toggle");
    toggleBtn.innerHTML = this.isCollapsed ? "&#9654;" : "&#9660;"; // ▶ or ▼
    toggleBtn.setAttribute("aria-label", this.isCollapsed ? "Expand" : "Collapse");

    header.appendChild(title);
    header.appendChild(toggleBtn);

    // Toggle handler
    header.addEventListener("click", () => {
      this.toggleCollapsed();
      toggleBtn.innerHTML = this.isCollapsed ? "&#9654;" : "&#9660;";
      toggleBtn.setAttribute("aria-label", this.isCollapsed ? "Expand" : "Collapse");
    });

    return header;
  }

  /**
   * Create view controls (Today / Trend toggle)
   */
  private createControls(): HTMLElement {
    const controls = document.createElement("div");
    controls.classList.add("productivity-tracker-controls");

    // View toggle buttons
    const viewToggle = document.createElement("div");
    viewToggle.classList.add("productivity-tracker-view-toggle");

    const todayBtn = document.createElement("button");
    todayBtn.textContent = "Today";
    todayBtn.classList.add("productivity-tracker-btn");
    if (this.currentView === "today") {
      todayBtn.classList.add("is-active");
    }

    const trendBtn = document.createElement("button");
    trendBtn.textContent = `${this.settings.lookbackWindow}-Day Trend`;
    trendBtn.classList.add("productivity-tracker-btn");
    if (this.currentView === "trend") {
      trendBtn.classList.add("is-active");
    }

    todayBtn.addEventListener("click", () => {
      this.currentView = "today";
      todayBtn.classList.add("is-active");
      trendBtn.classList.remove("is-active");
      this.renderChart();
    });

    trendBtn.addEventListener("click", () => {
      this.currentView = "trend";
      trendBtn.classList.add("is-active");
      todayBtn.classList.remove("is-active");
      this.renderChart();
    });

    viewToggle.appendChild(todayBtn);
    viewToggle.appendChild(trendBtn);

    // Lookback window selector (only visible in trend view)
    const lookbackSelector = document.createElement("div");
    lookbackSelector.classList.add("productivity-tracker-lookback");

    const select = document.createElement("select");
    select.classList.add("productivity-tracker-select");

    const options = [7, 14, 30, 90];
    options.forEach((days) => {
      const option = document.createElement("option");
      option.value = days.toString();
      option.textContent = `${days} days`;
      if (days === this.settings.lookbackWindow) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener("change", (e) => {
      const value = parseInt((e.target as HTMLSelectElement).value);
      this.settings.lookbackWindow = value;
      trendBtn.textContent = `${value}-Day Trend`;
      if (this.currentView === "trend") {
        this.renderChart();
      }
    });

    lookbackSelector.appendChild(select);

    controls.appendChild(viewToggle);
    controls.appendChild(lookbackSelector);

    return controls;
  }

  /**
   * Toggle collapsed state
   */
  private toggleCollapsed(): void {
    this.isCollapsed = !this.isCollapsed;

    if (this.container) {
      if (this.isCollapsed) {
        this.container.classList.add("is-collapsed");
      } else {
        this.container.classList.remove("is-collapsed");
      }
    }

    // Notify settings change
    this.onSettingsChange(this.isCollapsed);

    // Re-render chart when expanding
    if (!this.isCollapsed) {
      setTimeout(() => this.renderChart(), 100);
    }
  }

  /**
   * Expand panel (for auto-expand on first save)
   */
  expand(): void {
    if (this.isCollapsed) {
      this.toggleCollapsed();
    }
  }

  /**
   * Render the chart based on current view
   */
  renderChart(): void {
    if (!this.chartContainer || this.isCollapsed) return;

    // Check if we have data
    if (!this.dataTracker.hasData()) {
      this.chartRenderer.renderEmptyState(this.chartContainer);
      return;
    }

    if (this.currentView === "today") {
      const data = this.dataTracker.getTodayData();
      this.chartRenderer.render(this.chartContainer, data, {
        view: "today",
      });
    } else {
      const data = this.dataTracker.getAverageData(this.settings.lookbackWindow);
      const peakHours = this.dataTracker.findPeakHours(data, 3);
      this.chartRenderer.render(this.chartContainer, data, {
        view: "trend",
        lookbackDays: this.settings.lookbackWindow,
        peakHours,
      });
    }
  }

  /**
   * Refresh the chart
   */
  refresh(): void {
    this.renderChart();
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: ProductivityTrackerSettings): void {
    this.settings = settings;
    this.renderChart();
  }

  /**
   * Set view mode
   */
  setView(view: ChartView): void {
    this.currentView = view;
    this.renderChart();
  }

  /**
   * Check if panel is attached
   */
  isAttached(): boolean {
    return this.container !== null;
  }
}
