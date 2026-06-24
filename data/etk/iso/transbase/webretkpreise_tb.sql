--  rem Version: 1.01
--  rem Autor: K. Fellner
--  rem* **************************************************************************
--  rem*                                                                          
--  rem* Datei: webretkpreise_tb.sql
--  rem*                                                                          
--  rem* Aufruf: x webretkpreise_tb.sql
--  rem* 
--  rem* Mittels dieses SQL-Skripts werden die Relationen zur Verwaltung der sog. 
--  rem* Nutzerdaten erzeugt.
--  rem*                                                                          
--  rem* Änderungen:		              
--  rem* 25.07.03 Fellner:	Erstellung
--  rem* 22.06.05 Fenske:	neu: preise_firma 
--  rem* **************************************************************************

--  -----------------------------------------------------*
--  Preise-Tabelle (Transbase-Syntax)
--  -----------------------------------------------------*

CREATE TABLE w_preise (
	preise_firma			VARCHAR(10)		NOT NULL,	
	preise_sachnr			CHAR(7)			NOT NULL,
	preise_evpreis			NUMERIC(11,2), 
	preise_nachbelastung	NUMERIC(11,2),
	preise_rabattschluessel	VARCHAR(3),
	preise_preisaenderung	CHAR(1),
	preise_preis_kz			CHAR(1),
	preise_sonderpreis		NUMERIC(11,2),
	preise_sonderpreis_kz	CHAR(1),
	preise_mwst				NUMERIC(4,2),
	preise_mwst_code		CHAR(1),
	preise_zolltarifnr		VARCHAR(8),
	preise_nettopreis		NUMERIC(11,2)) KEY IS preise_firma, preise_sachnr;

ct;