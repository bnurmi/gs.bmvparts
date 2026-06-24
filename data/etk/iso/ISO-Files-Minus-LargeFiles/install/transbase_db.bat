rem Batch-Aktionen zum Anlegen und Befuellen der Datenbanken

rem nur bei Neuinstallation
if #UPDATE#==false #TARGETDIR#\transbase\createdb.bat #TARGETDIR#\transbase
