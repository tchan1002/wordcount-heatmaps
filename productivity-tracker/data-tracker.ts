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
   * Get current 30-minute bucket (e.g., "00:00", "00:30", "01:00", etc.)
   */
  getCurrentHourBucket(): string {
    const now = new Date();
    const hour = now.getHours().toString().padStart(2, "0");
    const halfHour = now.getMinutes() < 30 ? "00" : "30";
    return `${hour}:${halfHour}`;
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
   * Create empty day data with all 30-minute buckets initialized to 0
   */
  createEmptyDayData(): DailyHourData {
    const data: DailyHourData = {};
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0");
      data[`${hour}:00`] = 0;
      data[`${hour}:30`] = 0;
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
   * Get all bucket keys in order
   */
  private getBucketKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, "0");
      keys.push(`${hour}:00`);
      keys.push(`${hour}:30`);
    }
    return keys;
  }

  /**
   * Calculate average data over multiple days
   */
  getAverageData(days: number): DailyHourData {
    const result = this.createEmptyDayData();
    const counts: { [bucket: string]: number } = {};
    const bucketKeys = this.getBucketKeys();

    // Initialize counts
    for (const bucket of bucketKeys) {
      counts[bucket] = 0;
    }

    // Get dates for the lookback window
    const today = new Date();
    for (let d = 0; d < days; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateString = date.toISOString().split("T")[0];

      const dayData = this.data.dailyData[dateString];
      if (dayData) {
        for (const bucket of bucketKeys) {
          if (dayData[bucket] !== undefined && dayData[bucket] !== 0) {
            result[bucket] += dayData[bucket];
            counts[bucket]++;
          }
        }
      }
    }

    // Calculate averages
    for (const bucket of bucketKeys) {
      if (counts[bucket] > 0) {
        result[bucket] = Math.round(result[bucket] / counts[bucket]);
      }
    }

    return result;
  }

  /**
   * Find peak time slots from data
   */
  findPeakHours(data: DailyHourData, topN: number = 3): string[] {
    const entries = Object.entries(data)
      .map(([bucket, value]) => ({ bucket, value }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);

    return entries.map((e) => this.formatBucketLabel(e.bucket));
  }

  /**
   * Format bucket as readable label (e.g., "9am", "9:30am", "2pm", "2:30pm")
   */
  formatBucketLabel(bucket: string): string {
    const [hourStr, minStr] = bucket.split(":");
    const hour = parseInt(hourStr);
    const isHalfHour = minStr === "30";
    const suffix = isHalfHour ? ":30" : "";

    if (hour === 0) return `12${suffix}am`;
    if (hour === 12) return `12${suffix}pm`;
    if (hour < 12) return `${hour}${suffix}am`;
    return `${hour - 12}${suffix}pm`;
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
