export { Icon } from "./icons.generated"

export const Color = {
  Blue: "raycast-blue", Green: "raycast-green", Magenta: "raycast-magenta", Orange: "raycast-orange", Purple: "raycast-purple",
  Red: "raycast-red", Yellow: "raycast-yellow", PrimaryText: "raycast-primary-text", SecondaryText: "raycast-secondary-text"
} as const

export const ImageMask = { Circle: "circle", RoundedRectangle: "roundedRectangle" } as const
export const Image = { Mask: ImageMask }

export const ToastStyle = { Success: "SUCCESS", Failure: "FAILURE", Animated: "ANIMATED" } as const
export const AlertActionStyle = { Default: "DEFAULT", Cancel: "CANCEL", Destructive: "DESTRUCTIVE" } as const
export const ActionStyle = { Regular: "regular", Destructive: "destructive" } as const
export const LaunchType = { UserInitiated: "userInitiated", Background: "background" } as const
export const PopToRootType = { Default: "default", Immediate: "immediate", Suspended: "suspended" } as const
export const DatePickerType = { Date: "date", DateTime: "date_time" } as const
export const GridInset = { Zero: "zero", Small: "small", Medium: "medium", Large: "large" } as const
export const GridFit = { Contain: "contain", Fill: "fill" } as const
export const GridItemSize = { Small: "small", Medium: "medium", Large: "large" } as const
export const GridAspectRatio = { "1": "1", "3/2": "3/2", "2/3": "2/3", "4/3": "4/3", "3/4": "3/4", "16/9": "16/9", "9/16": "9/16" } as const

export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: { modifiers: ["cmd", "shift"], key: "c" },
      CopyDeeplink: { modifiers: ["cmd", "shift"], key: "c" },
      CopyName: { modifiers: ["cmd", "shift"], key: "." },
      CopyPath: { modifiers: ["cmd", "shift"], key: "," },
      Save: { modifiers: ["cmd"], key: "s" },
      Duplicate: { modifiers: ["cmd"], key: "d" },
      Edit: { modifiers: ["cmd"], key: "e" },
      MoveDown: { modifiers: ["cmd", "shift"], key: "arrowDown" },
      MoveUp: { modifiers: ["cmd", "shift"], key: "arrowUp" },
      New: { modifiers: ["cmd"], key: "n" },
      Open: { modifiers: ["cmd"], key: "o" },
      OpenWith: { modifiers: ["cmd", "shift"], key: "o" },
      Pin: { modifiers: ["cmd", "shift"], key: "p" },
      Refresh: { modifiers: ["cmd"], key: "r" },
      Remove: { modifiers: ["ctrl"], key: "x" },
      RemoveAll: { modifiers: ["ctrl", "shift"], key: "x" },
      ToggleQuickLook: { modifiers: ["cmd"], key: "y" }
    }
  }
}
