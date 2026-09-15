@echo off
cd /d "%~dp0"
py -3 commons_connector.py
if errorlevel 1 (
  echo Install Python 3.11 or later from https://www.python.org/downloads/windows/
  echo Include Tcl/Tk and the Python launcher. Then open this file again.
  pause
)
