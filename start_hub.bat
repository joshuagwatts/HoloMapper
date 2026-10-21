@echo off
rem HoloMapper Hub — double-click to start the local sync server.
rem Opens the console in your browser, already linked. Phones: open the
rem console's Pair screen and scan — the remote connects over your Wi-Fi
rem instantly, no relays, no internet needed.
cd /d %~dp0
title HoloMapper Hub
python hub.py
pause
