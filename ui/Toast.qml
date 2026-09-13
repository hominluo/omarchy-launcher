import QtQuick
import qs.Commons

// Status-bar toast: replaces the left side of the status bar while shown,
// like Raycast. style: "animated" (spinner) | "success" | "failure".
Item {
  id: toast
  property bool shown: false
  property string style: "success"
  property string title: ""
  property string message: ""
  property color foreground: Color.menu.text
  property string fontFamily: Style.font.menuFamily

  function show(spec) {
    toast.style = String(spec.style || "success")
    toast.title = String(spec.title || "")
    toast.message = String(spec.message || "")
    toast.shown = true
    hideTimer.interval = spec.duration ? Number(spec.duration) : (toast.style === "animated" ? 0 : 3200)
    if (hideTimer.interval > 0) hideTimer.restart()
    else hideTimer.stop()
  }
  function hide() { toast.shown = false; hideTimer.stop() }

  visible: shown
  implicitHeight: row.implicitHeight
  implicitWidth: row.implicitWidth

  Timer { id: hideTimer; onTriggered: toast.shown = false }

  Row {
    id: row
    spacing: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter

    Item {
      width: Style.space(16)
      height: Style.space(16)
      anchors.verticalCenter: parent.verticalCenter
      Text {
        anchors.centerIn: parent
        visible: toast.style !== "animated"
        text: toast.style === "failure" ? "󰅙" : "󰄴"
        color: toast.style === "failure" ? Color.urgent : Color.accent
        font.family: toast.fontFamily
        font.pixelSize: Style.font.title
        textFormat: Text.PlainText
      }
      Text {
        id: spinner
        anchors.centerIn: parent
        visible: toast.style === "animated"
        property int frame: 0
        readonly property var frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        text: frames[frame]
        color: Color.accent
        font.family: toast.fontFamily
        font.pixelSize: Style.font.title
        textFormat: Text.PlainText
        Timer {
          running: toast.shown && toast.style === "animated"
          interval: 80
          repeat: true
          onTriggered: spinner.frame = (spinner.frame + 1) % spinner.frames.length
        }
      }
    }
    Text {
      text: toast.title
      color: toast.foreground
      font.family: toast.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.weight: Font.Medium
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      elide: Text.ElideRight
    }
    Text {
      visible: toast.message.length > 0
      text: toast.message
      color: toast.foreground
      opacity: 0.6
      font.family: toast.fontFamily
      font.pixelSize: Style.font.bodySmall
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      elide: Text.ElideRight
    }
  }
}
