rem fuer den Standalone:

rem (Aufruf der RR Abfrage nur bei Update)
cd ..\migration
if %1 == false call migration.bat RR

rem Aufruf von Admintool
cd ..\admintool
call admintool.bat Publikationsdaten

rem (Aufruf des 2. Teils der Migration nur bei Neuinstallation)
cd ..\migration
if %1 == true call migration.bat Anpassung

cd ..
