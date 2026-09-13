// UI components of @raycast/api. Each renders a host element whose type the
// serializer understands; element-valued props (actions, detail, metadata,
// searchBarAccessory) are turned into children so the reconciler sees them.
import * as React from "react"
import { getClient } from "./client"
import { Icon, ActionStyle, DatePickerType, GridInset, GridFit, GridItemSize, GridAspectRatio } from "./enums"

const h = React.createElement

function rest(props: any, drop: string[]) {
  const out: any = {}
  for (const k of Object.keys(props || {})) if (drop.indexOf(k) < 0) out[k] = props[k]
  return out
}

// ---- navigation

export const NavigationContext = React.createContext<{ push: (el: any) => Promise<void>; pop: () => Promise<void> } | null>(null)

export function useNavigation() {
  const nav = React.useContext(NavigationContext)
  if (nav) return nav
  const client = getClient()
  return client.navigation || { push: async () => {}, pop: async () => {} }
}

// ---- lists

const Metadata: any = (props: any) => h("metadata", rest(props, ["children"]), props.children)
Metadata.Label = (props: any) => h("metadata-label", props)
Metadata.Link = (props: any) => h("metadata-link", props)
Metadata.TagList = (props: any) => h("metadata-taglist", rest(props, ["children"]), props.children)
Metadata.TagList.Item = (props: any) => h("metadata-tag", props)
Metadata.Separator = () => h("metadata-separator", {})

const Dropdown: any = (props: any) => h("dropdown", rest(props, ["children"]), props.children)
Dropdown.Item = (props: any) => h("dropdown-item", props)
Dropdown.Section = (props: any) => h("dropdown-section", rest(props, ["children"]), props.children)

const EmptyView: any = (props: any) => h("empty-view", rest(props, ["children", "actions"]), props.actions)

export const List: any = (props: any) => h("list", rest(props, ["children", "actions", "searchBarAccessory"]), props.searchBarAccessory, props.actions, props.children)
List.Item = (props: any) => h("list-item", rest(props, ["children", "actions", "detail"]), props.actions, props.detail, props.children)
List.Item.Detail = (props: any) => h("list-item-detail", rest(props, ["children", "metadata"]), props.metadata)
List.Item.Detail.Metadata = Metadata
List.Section = (props: any) => h("list-section", rest(props, ["children"]), props.children)
List.EmptyView = EmptyView
List.Dropdown = Dropdown

export const Grid: any = (props: any) => h("grid", rest(props, ["children", "actions", "searchBarAccessory"]), props.searchBarAccessory, props.actions, props.children)
Grid.Item = (props: any) => h("grid-item", rest(props, ["children", "actions"]), props.actions, props.children)
Grid.Section = (props: any) => h("grid-section", rest(props, ["children"]), props.children)
Grid.EmptyView = EmptyView
Grid.Dropdown = Dropdown
Grid.Inset = GridInset
Grid.Fit = GridFit
Grid.ItemSize = GridItemSize
Grid.AspectRatio = GridAspectRatio

export const Detail: any = (props: any) => h("detail", rest(props, ["children", "actions", "metadata"]), props.metadata, props.actions)
Detail.Metadata = Metadata

// ---- forms

export const Form: any = (props: any) => h("form", rest(props, ["children", "actions"]), props.actions, props.children)
Form.TextField = (props: any) => h("form-textfield", props)
Form.PasswordField = (props: any) => h("form-password", props)
Form.TextArea = (props: any) => h("form-textarea", props)
Form.Checkbox = (props: any) => h("form-checkbox", props)
Form.DatePicker = (props: any) => h("form-datepicker", props)
Form.DatePicker.Type = DatePickerType
Form.Dropdown = (props: any) => h("form-dropdown", rest(props, ["children"]), props.children)
Form.Dropdown.Item = (props: any) => h("dropdown-item", props)
Form.Dropdown.Section = (props: any) => h("dropdown-section", rest(props, ["children"]), props.children)
Form.TagPicker = (props: any) => h("form-tagpicker", rest(props, ["children"]), props.children)
Form.TagPicker.Item = (props: any) => h("dropdown-item", props)
Form.FilePicker = (props: any) => h("form-filepicker", props)
Form.Separator = () => h("form-separator", {})
Form.Description = (props: any) => h("form-description", props)
Form.LinkAccessory = (props: any) => h("form-linkaccessory", props)

// ---- actions

export const ActionPanel: any = (props: any) => h("action-panel", rest(props, ["children"]), props.children)
ActionPanel.Section = (props: any) => h("action-section", rest(props, ["children"]), props.children)
ActionPanel.Submenu = (props: any) => h("action-submenu", rest(props, ["children"]), props.children)
ActionPanel.Item = (props: any) => h("action", { kind: "callback", ...props })

function clipboardContent(content: any) {
  if (content === undefined || content === null) return { text: "" }
  if (typeof content === "string" || typeof content === "number") return { text: String(content) }
  if (typeof content === "object") return { text: content.text !== undefined ? String(content.text) : "", html: content.html, file: content.file ? String(content.file) : undefined }
  return { text: String(content) }
}

export const Action: any = (props: any) => h("action", { kind: "callback", ...props })
Action.Style = ActionStyle
Action.CopyToClipboard = (props: any) => h("action", { kind: "copy", title: props.title || "Copy to Clipboard", icon: props.icon || Icon.Clipboard, shortcut: props.shortcut, style: props.style, onCopy: props.onCopy, payload: { content: clipboardContent(props.content), concealed: props.concealed === true } })
Action.Paste = (props: any) => h("action", { kind: "paste", title: props.title || "Paste", icon: props.icon || Icon.Clipboard, shortcut: props.shortcut, style: props.style, onPaste: props.onPaste, payload: { content: clipboardContent(props.content) } })
Action.Open = (props: any) => h("action", { kind: "open", title: props.title || "Open", icon: props.icon || Icon.Finder, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { target: String(props.target), app: typeof props.application === "object" && props.application ? (props.application.path || props.application.name) : props.application } })
Action.OpenInBrowser = (props: any) => h("action", { kind: "openInBrowser", title: props.title || "Open in Browser", icon: props.icon || Icon.Globe, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { url: String(props.url) } })
Action.OpenWith = (props: any) => h("action", { kind: "openWith", title: props.title || "Open With", icon: props.icon || Icon.Upload, shortcut: props.shortcut, style: props.style, onOpen: props.onOpen, payload: { path: String(props.path) } })
Action.ShowInFinder = (props: any) => h("action", { kind: "showInFileManager", title: props.title || "Show in File Manager", icon: props.icon || Icon.Finder, shortcut: props.shortcut, style: props.style, onShow: props.onShow, payload: { path: String(props.path) } })
Action.Trash = (props: any) => h("action", { kind: "trash", title: props.title || "Move to Trash", icon: props.icon || Icon.Trash, shortcut: props.shortcut, style: props.style || "destructive", onTrash: props.onTrash, payload: { paths: Array.isArray(props.paths) ? props.paths.map(String) : [String(props.paths)] } })
Action.SubmitForm = (props: any) => h("action", { kind: "submitForm", title: props.title || "Submit Form", icon: props.icon, shortcut: props.shortcut, style: props.style, onSubmit: props.onSubmit })
Action.ToggleQuickLook = (props: any) => h("action", { kind: "toggleQuickLook", title: props.title || "Quick Look", icon: props.icon || Icon.Eye, shortcut: props.shortcut })
Action.PickDate = (props: any) => h("action", { kind: "pickDate", title: props.title || "Pick Date", icon: props.icon || Icon.Calendar, shortcut: props.shortcut, style: props.style, onChange: props.onChange, payload: { type: props.type || "date_time", min: props.min ? String(props.min) : undefined, max: props.max ? String(props.max) : undefined } })
Action.PickDate.Type = DatePickerType
Action.CreateSnippet = (props: any) => h("action", { kind: "createSnippet", title: props.title || "Create Snippet", icon: props.icon || Icon.Snippets, shortcut: props.shortcut, payload: { snippet: props.snippet || {} } })
Action.CreateQuicklink = (props: any) => h("action", { kind: "createQuicklink", title: props.title || "Create Quicklink", icon: props.icon || Icon.Link, shortcut: props.shortcut, payload: { quicklink: props.quicklink || {} } })
Action.InstallMCPServer = (props: any) => h("action", { kind: "callback", title: props.title || "Install MCP Server", icon: props.icon || Icon.Plug, shortcut: props.shortcut, onAction: () => getClient().notify("manager.log", { level: "warn", line: "Action.InstallMCPServer is not supported" }) })
Action.Push = (props: any) => {
  const nav = useNavigation()
  return h("action", { kind: "callback", title: props.title, icon: props.icon, shortcut: props.shortcut, style: props.style, autoFocus: props.autoFocus, onAction: () => { nav.push(props.target); if (props.onPush) props.onPush() } })
}

// ---- menu bar

export const MenuBarExtra: any = (props: any) => h("menubar", rest(props, ["children"]), props.children)
MenuBarExtra.Item = (props: any) => h("menubar-item", props)
MenuBarExtra.Submenu = (props: any) => h("menubar-submenu", rest(props, ["children"]), props.children)
MenuBarExtra.Section = (props: any) => h("menubar-section", rest(props, ["children"]), props.children)
MenuBarExtra.Separator = () => h("menubar-separator", {})

// ---- legacy names (pre-1.0 extensions)

export const ListItem = List.Item
export const ListSection = List.Section
export const FormTextField = Form.TextField
export const FormTextArea = Form.TextArea
export const FormCheckbox = Form.Checkbox
export const FormDatePicker = Form.DatePicker
export const FormDropdown = Form.Dropdown
export const FormDropdownItem = Form.Dropdown.Item
export const FormDropdownSection = Form.Dropdown.Section
export const FormTagPicker = Form.TagPicker
export const FormTagPickerItem = Form.TagPicker.Item
export const FormSeparator = Form.Separator
export const ActionPanelItem = ActionPanel.Item
export const ActionPanelSection = ActionPanel.Section
export const ActionPanelSubmenu = ActionPanel.Submenu
export const CopyToClipboardAction = Action.CopyToClipboard
export const PasteAction = Action.Paste
export const OpenAction = Action.Open
export const OpenInBrowserAction = Action.OpenInBrowser
export const OpenWithAction = Action.OpenWith
export const ShowInFinderAction = Action.ShowInFinder
export const TrashAction = Action.Trash
export const PushAction = Action.Push
export const SubmitFormAction = Action.SubmitForm
export const useActionPanel = () => ({ update: () => {} })
export const useId = () => React.useId()
export const render = (element: any) => element
