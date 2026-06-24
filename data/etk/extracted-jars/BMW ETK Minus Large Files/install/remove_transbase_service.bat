rem Batch-Aktionen zum Entfernen des Transbase Service

transbase\tbmux32.exe stop
transbase\tbmux32.exe remove
rem msg OG 02.07.2010 - Defect # 055
rem msg OG 26.10.2010 - DEF # Bei der Deinstallation des ETK auf win2003 gab es zwei Meldungen,
rem                     die zwar unschön sind, aber sonst keine negativen Auswirkungen hatten (siehe Att)
rem                     ist auch nicht notwendig
rem sc delete Transbase