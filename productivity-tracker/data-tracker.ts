import { TFile, Vault } from "obsidian";
import { DailyHourData, PluginData } from "./types";

// Debounce interval in milliseconds
const DEBOUNCE_INTERVAL = 3000;

export class DataTracker {
  private data: PluginData;
  private vault: Vault;
  private saveCallback: () => Promise<void>;

  constructor(data: PluginData, vault: Vault, saveCallback: () => Promise<void>) {
    this.data = data;
    this.vault = vault;
    this.saveCallback = saveCallback;
  }

  /**
   * Calculate word count from text, excluding frontmatter
   */
  calculateWordCount(content: string): number {
    // Remove frontmatter (content between --- delimiters at the start)
    let text = content;
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
    if (frontmatterMatch) {
      text = content.slice(frontmatterMatch[0].length);
    }

    // Split by whitespace and filter empty strings
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Get current date string in YYYY-MM-DD format
   */
  getCurrentDateString(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }

  /**
   * Get current hour bucket (00-23)
   */
  getCurrentHourBucket(): string {
    const now = new Date();
    return now.getHours().toString().padStart(2, "0");
  }

  /**
   * Check if file is in the tracked folder
   */
  isFileInTrackedFolder(file: TFile, trackingFolder: string): boolean {
    if (!trackingFolder) {
      return false;
    }

    // Normalize paths for comparison
    const normalizedTrackingFolder = trackingFolder.replace(/^\/|\/$/g, "");
    const filePath = file.path;

    // Check if file path starts with the tracking folder
    return filePath.startsWith(normalizedTrackingFolder + "/") ||
           filePath === normalizedTrackingFolder;
  }

  /**
   * Check if we should process this save (debounce)
   */
  shouldProcessSave(filePath: string): boolean {
    const now = Date.now();
    const lastSave = this.data.lastSaveTime[filePath] || 0;

    if (now - lastSave < DEBOUNCE_INTERVAL) {
      return false;
    }

    this.data.lastSaveTime[filePath] = now;
    return true;
  }

  /**
   * Extract date string from filename (YYYY-MM-DD format)
   * Returns null if filename doesn't start with a valid date
   */
  getDateFromFile(file: TFile): string | null {
    const fileBasename = file.basename;
    // Match YYYY-MM-DD at the start of filename
    const dateMatch = fileBasename.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateMatch ? dateMatch[1] : null;
  }

  /**
   * Check if filename matches today's date (YYYY-MM-DD format)
   */
  private isFileFromToday(file: TFile): boolean {
    const todayString = this.getCurrentDateString();
    const fileDate = this.getDateFromFile(file);
    return fileDate === todayString;
  }

  /**
   * Process a file modification event
   */
  async processFileModification(file: TFile): Promise<{ delta: number; isFirstSaveOfDay: boolean } | null> {
    const trackingFolder = this.data.settings.trackingFolder;

    // Check if file is in tracked folder
    if (!this.isFileInTrackedFolder(file, trackingFolder)) {
      return null;
    }

    // Only track changes to today's daily note
    // This prevents edits to old entries from affecting historical data
    if (!this.isFileFromToday(file)) {
      return null;
    }

    // Check debounce
    if (!this.shouldProcessSave(file.path)) {
      return null;
    }

    // Read file content
    const content = await this.vault.read(file);
    const currentWordCount = this.calculateWordCount(content);

    // Get previous word count from cache
    const previousWordCount = this.data.wordCountCache[file.path] || 0;

    // Calculate delta
    const delta = currentWordCount - previousWordCount;

    // Update cache
    this.data.wordCountCache[file.path] = currentWordCount;

    // Get current date and hour
    const dateString = this.getCurrentDateString();
    const hourBucket = this.getCurrentHourBucket();

    // Check if this is the first save of the day
    const isFirstSaveOfDay = !this.data.dailyData[dateString];

    // Initialize daily data if needed
    if (!this.data.dailyData[dateString]) {
      this.data.dailyData[dateString] = this.createEmptyDayData();
    }

    // Accumulate delta (don't replace)
    this.data.dailyData[dateString][hourBucket] += delta;

    // Save data
    await this.saveCallback();

    return { delta, isFirstSaveOfDay };
  }

  /**
   * Create empty day data with all hour buckets initialized to 0
   */
  createEmptyDayData(): DailyHourData {
    const data: DailyHourData = {};
    for (let i = 0; i < 24; i++) {
      data[i.toString().padStart(2, "0")] = 0;
    }
    return data;
  }

  /**
   * Get data for a specific date
   */
  getDayData(dateString: string): DailyHourData | null {
    return this.data.dailyData[dateString] || null;
  }

  /**
   * Get today's data
   */
  getTodayData(): DailyHourData {
    const dateString = this.getCurrentDateString();
    return this.data.dailyData[dateString] || this.createEmptyDayData();
  }

  /**
   * Calculate average data over multiple days
   */
  getAverageData(days: number): DailyHourData {
    const result = this.createEmptyDayData();
    const counts: { [hour: string]: number } = {};

    // Initialize counts
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0");
      counts[hour] = 0;
    }

    // Get dates for the lookback window
    const today = new Date();
    for (let d = 0; d < days; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateString = date.toISOString().split("T")[0];

      const dayData = this.data.dailyData[dateString];
      if (dayData) {
        for (let i = 0; i < 24; i++) {
          const hour = i.toString().padStart(2, "0");
          if (dayData[hour] !== 0) {
            result[hour] += dayData[hour];
            counts[hour]++;
          }
        }
      }
    }

    // Calculate averages
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0");
      if (counts[hour] > 0) {
        result[hour] = Math.round(result[hour] / counts[hour]);
      }
    }

    return result;
  }

  /**
   * Find peak hours from data
   */
  findPeakHours(data: DailyHourData, topN: number = 3): string[] {
    const entries = Object.entries(data)
      .map(([hour, value]) => ({ hour, value }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);

    return entries.map((e) => this.formatHourLabel(parseInt(e.hour)));
  }

  /**
   * Format hour as readable label (e.g., "9am", "2pm")
   */
  formatHourLabel(hour: number): string {
    if (hour === 0) return "12am";
    if (hour === 12) return "12pm";
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  }

  /**
   * Check if there's any data recorded
   */
  hasData(): boolean {
    return Object.keys(this.data.dailyData).length > 0;
  }

  /**
   * Check if there's data for today
   */
  hasTodayData(): boolean {
    const dateString = this.getCurrentDateString();
    const dayData = this.data.dailyData[dateString];
    if (!dayData) return false;

    return Object.values(dayData).some((v) => v !== 0);
  }

  /**
   * Initialize word count cache for a file (used on file open)
   * Only caches today's file to prevent old file edits from being tracked
   */
  async initializeFileCache(file: TFile): Promise<void> {
    if (!this.isFileInTrackedFolder(file, this.data.settings.trackingFolder)) {
      return;
    }

    // Only initialize cache for today's file
    if (!this.isFileFromToday(file)) {
      return;
    }

    if (this.data.wordCountCache[file.path] === undefined) {
      const content = await this.vault.read(file);
      this.data.wordCountCache[file.path] = this.calculateWordCount(content);
    }
  }
}
