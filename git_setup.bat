@echo off
echo ========================================================
echo   Configurando Git y Subiendo a GitHub
echo ========================================================
echo.

:: 1. Initialize Git
if not exist .git (
    echo [1/5] Inicializando repositorio git...
    git init
) else (
    echo [1/5] Repositorio git ya existe.
)

:: 2. Configure Remote
echo [2/5] Configurando remoto 'origin'...
git remote remove origin 2>nul
git remote add origin https://github.com/guiasLocales/importfull-catalogo.git

:: 3. Prepare Branch
echo [3/5] Configurando rama principal...
git branch -M main

:: 4. Add and Commit
echo [4/5] Guardando cambios...
git add .
git commit -m "Setup Google Cloud Build CI/CD"

:: 5. Push
echo [5/5] Subiendo a GitHub...
echo.
echo [!] Si te pide credenciales, ingresalas en la ventana emergente.
echo.
git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo [OK] Codigo subido exitosamente!
    echo Ahora ve a Google Cloud Console para crear el Trigger.
) else (
    echo [ERROR] Hubo un problema al subir. Revisa los mensajes arriba.
)
pause
