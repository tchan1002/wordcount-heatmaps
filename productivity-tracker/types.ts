// Hour bucket type (00-23)
export type HourBucket = string;

// Daily data with hour buckets
export interface DailyHourData {
  [hour: HourBucket]: number;
}

// All daily data indexed by date string (YYYY-MM-DD)
export interface DailyData {
  [date: string]: DailyHourData;
}

// Plugin settings
export interface ProductivityTrackerSettings {
  trackingFolder: string;
  lookbackWindow: number;
  panelCollapsed: boolean;
  autoExpandPanel: boolean;
}

// Complete plugin data structure
export interface PluginData {
  dailyData: DailyData;
  settings: ProductivityTrackerSettings;
  wordCountCache: { [filePath: string]: number };
  lastSaveTime: { [filePath: string]: number };
}

// Default settings
export const DEFAULT_SETTINGS: ProductivityTrackerSettings = {
  trackingFolder: "",
  lookbackWindow: 7,
  panelCollapsed: false,
  autoExpandPanel: true,
};

// Default plugin data
export const DEFAULT_DATA: PluginData = {
  dailyData: {},
  settings: DEFAULT_SETTINGS,
  wordCountCache: {},
  lastSaveTime: {},
};
