import { Chart, ChartConfiguration, LineControllerDatasetOptions, registerables } from "chart.js";
import { DailyHourData } from "./types";

// Type for line dataset with point properties
type LineDataset = Partial<LineControllerDatasetOptions> & {
  label: string;
  data: number[];
};

// Register all Chart.js components
Chart.register(...registerables);

export type ChartView = "today" | "trend";

export interface ChartOptions {
  view: ChartView;
  lookbackDays?: number;
  peakHours?: string[];
}

export class ChartRenderer {
  private chart: Chart | null = null;
  private canvas: HTMLCanvasElement | null = null;

  /**
   * Format hour labels for x-axis
   */
  private getHourLabels(): string[] {
    const labels: string[] = [];
    for (let i = 0; i < 24; i++) {
      if (i === 0) labels.push("12am");
      else if (i === 12) labels.push("12pm");
      else if (i < 12) labels.push(`${i}am`);
      else labels.push(`${i - 12}pm`);
    }
    return labels;
  }

  /**
   * Convert DailyHourData to array of values
   */
  private dataToArray(data: DailyHourData): number[] {
    const values: number[] = [];
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0");
      values.push(data[hour] || 0);
    }
    return values;
  }

  /**
   * Create gradient for line
   */
  private createGradient(
    ctx: CanvasRenderingContext2D,
    chartArea: { left: number; right: number },
    isTrend: boolean
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);

    if (isTrend) {
      // Purple to pink gradient for trend view
      gradient.addColorStop(0, "rgba(139, 92, 246, 1)");
      gradient.addColorStop(0.5, "rgba(217, 70, 239, 1)");
      gradient.addColorStop(1, "rgba(244, 114, 182, 1)");
    } else {
      // Blue to purple gradient for today view
      gradient.addColorStop(0, "rgba(59, 130, 246, 1)");
      gradient.addColorStop(0.5, "rgba(99, 102, 241, 1)");
      gradient.addColorStop(1, "rgba(139, 92, 246, 1)");
    }

    return gradient;
  }

  /**
   * Create fill gradient (below line)
   */
  private createFillGradient(
    ctx: CanvasRenderingContext2D,
    chartArea: { top: number; bottom: number },
    isTrend: boolean
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

    if (isTrend) {
      gradient.addColorStop(0, "rgba(139, 92, 246, 0.3)");
      gradient.addColorStop(1, "rgba(139, 92, 246, 0.0)");
    } else {
      gradient.addColorStop(0, "rgba(59, 130, 246, 0.3)");
      gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");
    }

    return gradient;
  }

  /**
   * Render or update chart
   */
  render(
    container: HTMLElement,
    data: DailyHourData,
    options: ChartOptions
  ): void {
    const { view, lookbackDays, peakHours } = options;
    const isTrend = view === "trend";

    // Create canvas if needed
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.classList.add("productivity-tracker-chart");
      container.appendChild(this.canvas);
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const labels = this.getHourLabels();
    const values = this.dataToArray(data);

    // Build title
    let title = isTrend
      ? `${lookbackDays || 7}-Day Average Writing Pattern`
      : "Today's Writing Activity";

    // Add peak hours annotation for trend view
    if (isTrend && peakHours && peakHours.length > 0) {
      title += ` (Peak: ${peakHours.join(", ")})`;
    }

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
    }

    // Chart configuration
    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Words",
            data: values,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          title: {
            display: true,
            text: title,
            font: {
              size: 14,
              weight: "bold",
            },
            padding: { bottom: 10 },
          },
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleFont: { size: 13 },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (context) => {
                const value = context.raw as number;
                const sign = value >= 0 ? "+" : "";
                return `${sign}${value} words`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10 },
            },
          },
          y: {
            grid: {
              color: "rgba(128, 128, 128, 0.1)",
            },
            ticks: {
              font: { size: 11 },
              callback: (value) => {
                const num = value as number;
                if (num >= 0) return `+${num}`;
                return num.toString();
              },
            },
          },
        },
      },
    };

    // Set colors directly in config to avoid recursion issues
    const borderColor = isTrend ? "rgba(139, 92, 246, 1)" : "rgba(59, 130, 246, 1)";
    const bgColor = isTrend ? "rgba(139, 92, 246, 0.1)" : "rgba(59, 130, 246, 0.1)";
    const pointColor = isTrend ? "rgba(139, 92, 246, 1)" : "rgba(59, 130, 246, 1)";

    config.data.datasets[0] = {
      ...config.data.datasets[0],
      borderColor: borderColor,
      backgroundColor: bgColor,
      pointBackgroundColor: pointColor,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
    };

    // Create chart
    this.chart = new Chart(ctx, config);
  }

  /**
   * Render empty state
   */
  renderEmptyState(container: HTMLElement): void {
    container.innerHTML = "";

    const emptyState = document.createElement("div");
    emptyState.classList.add("productivity-tracker-empty");
    emptyState.innerHTML = `
      <div class="productivity-tracker-empty-icon">📊</div>
      <div class="productivity-tracker-empty-text">
        No data yet. Start writing to see your productivity patterns!
      </div>
    `;

    container.appendChild(emptyState);
  }

  /**
   * Destroy chart
   */
  destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
}
