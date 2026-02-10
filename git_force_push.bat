@echo off
echo ========================================================
echo   FORZAR Subida a GitHub (Sobrescribir Remoto)
echo ========================================================
echo.
echo ATENCION:
echo El repositorio en GitHub tiene cambios que no tienes aqui.
echo Al ejecutar esto, SOBRESCRIBIRAS lo que hay en GitHub
echo con lo que tienes en esta carpeta.
echo.
echo Esto es CORRECTO si quieres que tu PC sea la "verdad".
echo.
pause

echo [1/2] Ensure remote is set...
git remote add origin https://github.com/guiasLocales/importfull-catalogo.git 2>nul

echo [2/2] Force Pushing...
git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo [OK] Exito! Tu codigo esta ahora en GitHub.
) else (
    echo [ERROR] Fallo. Revisa el mensaje.
)
pause
