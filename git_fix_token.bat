@echo off
echo ========================================================
echo   Subiendo Credenciales (Token) a GitHub
echo ========================================================
echo.
echo El push anterior funciono, pero el archivo 'token.json'
echo se quedo atras porque estaba bloqueado.
echo.
echo Vamos a subirlo ahora para que Google Cloud funcione.

git add .gitignore token.json
git commit -m "Add token.json for Cloud Build auth"
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo [OK] Ahora SI esta todo listo en GitHub.
    echo.
    echo Siguiente paso: Configurar el Trigger en Cloud Build.
    echo (Mira el archivo GITHUB_SETUP.md paso 3)
) else (
    echo [ERROR] Algo fallo.
)
pause
