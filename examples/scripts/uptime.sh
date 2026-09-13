#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Uptime
# @raycast.mode inline
# @raycast.refreshTime 1m
# @raycast.packageName System
# @raycast.icon ⏱️
uptime -p | sed 's/^up //'
