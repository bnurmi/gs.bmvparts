rem Batch-Aktionen zum Entfernen des Tomcat Service

set CATALINA_HOME=%cd%\tomcat

net stop Tomcat

call tomcat\bin\service.bat remove Tomcat
