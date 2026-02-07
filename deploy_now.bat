@echo off
echo ========================================================
echo   Iniciando Despliegue a Google Cloud Run
echo ========================================================
echo.
echo Comando a ejecutar:
echo gcloud run deploy inventory-app --source . --region us-central1 --allow-unauthenticated
echo.
echo [!] Asegurate de estar logueado en gcloud antes.
echo.
pause

call gcloud run deploy inventory-app --source . --region us-central1 --allow-unauthenticated

echo.
if %ERRORLEVEL% EQU 0 (
    echo [OK] Despliegue Exitoso!
    echo Los cambios estan online.
) else (
    echo [ERROR] Algo fallo. Revisa el mensaje arriba.
)
echo.
pause
