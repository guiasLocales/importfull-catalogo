@echo off
echo ========================================================
echo   Auto-Sync: Subiendo cambios a GitHub...
echo ========================================================
git add .
git commit -m "Auto-update by Assistant"
git push
echo [OK] Done.
pause
