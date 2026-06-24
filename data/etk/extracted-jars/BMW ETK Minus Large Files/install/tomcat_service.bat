rem Batch-Aktionen zum Einrichten von Tomcat als Service

set CATALINA_HOME=%cd%\tomcat

call tomcat\bin\service.bat install Tomcat

call tomcat\bin\tomcat7.exe //US//Tomcat --DisplayName=ETK-Tomcat --Startup=auto

net start "Tomcat"