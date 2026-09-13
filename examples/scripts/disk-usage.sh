#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Disk Usage
# @raycast.mode fullOutput
# @raycast.packageName System
# @raycast.icon 💾
# @raycast.argument1 {"type":"text","placeholder":"path","optional":true}
df -h "${1:-/}"
