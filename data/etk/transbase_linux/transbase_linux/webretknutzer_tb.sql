--  Version: 1.14
--  Autor: K. Fellner
-- * **************************************************************************
-- * *** Achtung ***
-- * Bei Aufnahme neuer Tabellen muss das Admintool (Sicherungen einspielen)
-- * angepasst werden!!                                                                         
-- * **************************************************************************
-- *                                                                          
-- * Datei: webretknutzer_tb.sql
-- *                                                                          
-- * Aufruf: x webretknutzer_tb.sql
-- * 
-- * Mittels dieses SQL-Skripts werden die Relationen zur Verwaltung der sog. 
-- * Nutzerdaten unter Transbase erzeugt.
-- *                                                                          
-- * Änderungen:		              
-- * 01.08.03 Fellner:	Erstellung 
-- * 20.10.03 Fellner:	w_firma um firma_verzeichnis erweitert
-- * 06.11.03 Fellner:	w_sprachen raus (die Sprachen werden nun im Redaktionssystem
-- *                    verwaltet und über die Tabelle w_publben publiziert
-- * 20.11.03 Fellner:	w_url und w_admin raus, da die Tabellen nicht verwendet werden
-- *                    w_auftrag: auftrag_auftragsnr auf NOT NULL geändert
-- * 09.01.04 Fellner:  w_teilelistepos: teilelistepos_altteil_steuer von NUMERIC(4,2) auf 
-- *                                     NUMERIC(5,2) erhöht
-- * 21.01.04 Fellner:  w_teilelistepos: teilelistepos_preis von Number(8,2) auf Number(11,2)
-- *                    w_teileliste_sendeinfo: teilelistesi_gegeben_bar und teilelistesi_gegeben_unbar 
-- *                                            von Number(8,2) auf Number(11,2)
-- *                    w_konfig: konfig_hd_plz von Varchar(6) auf Varchar(10) erhöht
-- *                    Grund: Anpassung an DMS-Schnittstelle
-- * 05.02.04 Fellner:  w_user_einstellungen: Attribut user_suchraum neu
-- * 12.03.04 Fenske:   w_teileinfo: Attribut teileinfo_allgemein neu
-- * 21.04.04 Fellner:  w_konfig: Attribute konfig_hdnr_pkw und konfig_hdnr_motorrad
-- *                              von INTEGER auf VARCHAR(5) geändert
-- * 17.08.04 Fellner:  neue Tabellen: w_netz und w_proxy
-- * 22.12.04 Fenske:	w_user_einstellungen um user_show_preise erweitert
-- * 18.05.05 Fenske:	w_teileliste um teileliste_gesperrt_von und teileliste_gesperrt_am
-- *						 teileliste_auftragsnr_lokal teileliste_kundennr_lokal
-- *						 teileliste_privat erweitert
-- * 08.06.05 Fellner:  w_user um user_bearbeiternummer erweitert
-- *                    w_teilelistepos: teilelistepos_menge von NUMERIC(5,2) auf NUMERIC(7,2)
-- *                    w_bestelllistepos: bestelllistepos_menge von NUMERIC(5,2) auf NUMERIC(7,2)
-- * 12.06.06 Fenske:	Auftragsnummer fuer DMS erweitern
-- * 21.02.06 Fellner:  w_teileliste um teileliste_fzgdurchlauf erweitert
-- *                    w_teilelistepos um teilelistepos_job_id, teilelistepos_srp_id, 
-- *                                       teilelistepos_status und teilelistepos_pruefen erweitert
-- *                    Tabellen w_teileliste_job und w_teileliste_srp neu
-- *                    Sequence teileliste_score_id_seq neu
-- * 25.04.06 Fenske:   w_teilelistepos, w_teileliste_job und w_teileliste_srp erweitert
-- * 26.06.06 Fenske:	w_teilelistepos: neues Feld teilelistepos_fistring
-- * 13.09.06 Fellner:	w_user_einstellungen: neues Feld user_show_tipps
-- *                    w_user_tipps, w_tipp neu
-- * 09.05.07 Fellner:	Verwaltungstabellen für IPAC (w_zub_<Name>)
-- *                    + zugehörige Sequencen
-- * 21.06.07 Schunk:	Tabelle w_user nach Rücksprache mit Jan um Feld: user_marktId Default = 0 erweitert
-- * 05.03.10 msg OG:	w_user_einstellungen: neues Feld user_dft_verbaumenge
-- * 29.09.10 msg OG:	CR # 023 - w_zub_konfig_angebot: neues Feld vorganga_bemerkung
-- * 02.11.10 msg LK	DEF # 062 - w_dealer_type: neue Tabelle um Marktselektion und Händlertyp abzulegen
-- * 03.05.11 msg   :   ASPG, Tabelle w_teilelistepos, add teilelistepos_typ, teilelistepos_ref, teilelistepos_menge_org
-- *
-- * **************************************************************************

--  ******************************************************
--   Verwaltungstabellen ("normaler ETK")
--   - werden z.Teil auch von IPAC genutzt
--  ******************************************************

--  -----------------------------------------------------*
--   Firma
--  -----------------------------------------------------*

CREATE TABLE w_firma (
	firma_id				VARCHAR(10)		NOT NULL, 	
	firma_bezeichnung		VARCHAR(40)		NOT NULL,
	firma_verzeichnis       VARCHAR(256)	) KEY IS firma_id;

--  -----------------------------------------------------*
--   Firma-Berechtigungen
--  -----------------------------------------------------*

CREATE TABLE w_firma_berechtigungen (
	firmab_firma_id			VARCHAR(10)	NOT NULL,
	firmab_art				VARCHAR(20)	NOT NULL,
	firmab_wert				VARCHAR(20)	NOT NULL) KEY IS firmab_firma_id, firmab_art, firmab_wert;

--  -----------------------------------------------------*
--   Filiale
--  -----------------------------------------------------*

CREATE TABLE w_filiale (
	filiale_firma_id		VARCHAR(10)		NOT NULL,
	filiale_id				VARCHAR(4)		NOT NULL,
	filiale_bezeichnung		VARCHAR(40)		NOT NULL,
	filiale_iso				CHAR(2)			NOT NULL,
	filiale_regiso			CHAR(2)			NOT NULL) KEY IS filiale_firma_id, filiale_id; 

--  -----------------------------------------------------*
--   Konfiguration
--  -----------------------------------------------------*

CREATE TABLE w_konfig (
	konfig_firma_id			VARCHAR(10)		NOT NULL,
	konfig_filiale_id		VARCHAR(4)		NOT NULL, 
	konfig_hs_verwenden		CHAR(1)			NOT NULL,
	konfig_abwicklung		CHAR(1)			,
	konfig_bestandfiliale	CHAR(1)			,
	konfig_datenabgleich	CHAR(1)			,
	konfig_hd_firma			VARCHAR(30)		,
	konfig_hd_zusatz		VARCHAR(36)		,
	konfig_hd_strasse		VARCHAR(25)		,
	konfig_hd_plz			VARCHAR(10)		,
	konfig_hd_ort			VARCHAR(20)		,
	konfig_hd_telefon		VARCHAR(12)		,
	konfig_hdnr_pkw			VARCHAR(5)   	,
	konfig_hdnr_motorrad	VARCHAR(5) 		,
	konfig_mwst_niedrig		NUMERIC(5,2)	,
	konfig_mwst_hoch		NUMERIC(5,2)	,
	konfig_mwst_altteile	NUMERIC(5,2)	,
	konfig_mwst_3			NUMERIC(5,2)	,
	konfig_mwst_4			NUMERIC(5,2)	,
	konfig_rechnungnr		NUMERIC(11)		,
	konfig_mailserver		VARCHAR(40)		,
	konfig_barverkaufnr		INTEGER			,
	konfig_auftragnr		VARCHAR(10)		,
	konfig_kundennr			NUMERIC(7)				) KEY IS konfig_firma_id, konfig_filiale_id;

--  -----------------------------------------------------*
--   Benutzer
--  -----------------------------------------------------*

CREATE TABLE w_user (
	user_firma_id			VARCHAR(10)		NOT NULL, 
	user_id					VARCHAR(10)		NOT NULL, 
	user_name				VARCHAR(20)		NOT NULL, 
	user_passwort			VARCHAR(20)		NOT NULL,
	user_default_filiale_id	VARCHAR(4)		NOT NULL,
	user_bearbeiternummer	INTEGER,
	user_marktid			INTEGER DEFAULT 0 NOT NULL ) KEY IS user_firma_id, user_id;

--  -----------------------------------------------------*
--   Benutzer-Einstellungen
--  -----------------------------------------------------*

CREATE TABLE w_user_einstellungen (
	user_firma_id			VARCHAR(10)		NOT NULL,
	user_id					VARCHAR(10)		NOT NULL,
	user_marke				VARCHAR(11)		NOT NULL,
	user_produktart			CHAR(1)			NOT NULL,
	user_katalogumfang		VARCHAR(10)		NOT NULL,
	user_iso				CHAR(2)			, 
	user_regiso				CHAR(2)			, 
	user_lenkung			VARCHAR(10)		NOT NULL,
	user_expand_bnb			CHAR(1)			NOT NULL,
	user_short_searchpath 	CHAR(1)			NOT NULL,
	user_request_saz		CHAR(1)			NOT NULL,
	user_show_proddate		CHAR(1)			,
	user_suchraum			CHAR(1)			NOT NULL,
	user_fontsize			CHAR(1)			NOT NULL,
	user_tablestretch		CHAR(1)			NOT NULL,
	user_show_preise		CHAR(1)			,
	user_show_tipps			CHAR(1)			NOT NULL,
	user_primaermarkt_id	integer					,
	user_dft_verbaumenge 	CHAR(1)			DEFAULT 'N' NOT NULL, 
	user_aufbewahrung		CHAR(1)			DEFAULT 'N' NOT NULL,) KEY IS user_firma_id, user_id;

--  -----------------------------------------------------*
--   Benutzer-Einstellungen bzgl. Katalogausführungen
--  -----------------------------------------------------*

CREATE TABLE w_user_einstellungen_region (
	user_firma_id		VARCHAR(10)			NOT NULL,
	user_id				VARCHAR(10)			NOT NULL,
	user_region			VARCHAR(3)			NOT NULL) KEY IS user_firma_id, user_id, user_region;

--  -----------------------------------------------------*
--   Benutzer-Einstellungen bzgl. weitere Maerkte
--  -----------------------------------------------------*

CREATE TABLE w_user_einstellungen_wmaerkte (
	user_firma_id		VARCHAR(10)			NOT NULL,
	user_id				VARCHAR(10)			NOT NULL,
	user_markt_id		integer				NOT NULL) KEY IS user_firma_id, user_id, user_markt_id;

--  -----------------------------------------------------*
--   Benutzer-Rechte
--  -----------------------------------------------------*

CREATE TABLE w_user_berechtigungen (
	userb_firma_id		VARCHAR(10)			NOT NULL, 
	userb_id			VARCHAR(10)			NOT NULL, 
	userb_art			VARCHAR(20)			NOT NULL, 
	userb_wert			VARCHAR(20)			NOT NULL) KEY IS userb_firma_id, userb_id, userb_art, userb_wert;

--  -----------------------------------------------------*
--   Benutzer-Funktionsrechte
--  -----------------------------------------------------*

CREATE TABLE w_user_funktionsrechte (
	userf_firma_id		VARCHAR(10)			NOT NULL, 
	userf_id			VARCHAR(10)			NOT NULL, 
	userf_recht_id		VARCHAR(40)			NOT NULL) KEY IS userf_firma_id, userf_id, userf_recht_id;

--  -----------------------------------------------------*
--   Benutzer-Tipps (welche Tipps hat Nutzer schon gelesen)
--  -----------------------------------------------------*

CREATE TABLE w_user_tipps (
	usert_firma_id		VARCHAR(10)			NOT NULL,
	usert_id			VARCHAR(10)			NOT NULL,
	usert_tipp_id		NUMERIC(9)			NOT NULL) KEY IS usert_firma_id, usert_id, usert_tipp_id;

--  -----------------------------------------------------*
--   Teileliste
--  -----------------------------------------------------*

CREATE TABLE w_teileliste (
	teileliste_firma_id			VARCHAR(10)		NOT NULL, 
	teileliste_filiale_id		VARCHAR(4)		NOT NULL, 
	teileliste_user_id			VARCHAR(10)		NOT NULL, 
	teileliste_id				VARCHAR(20)		NOT NULL, 
	teileliste_bemerkung		VARCHAR(20)		, 
	teileliste_erzeugt			INTEGER			NOT NULL, 
	teileliste_geaendert		INTEGER			,
	teileliste_marke			VARCHAR(11)		NOT NULL, 
	teileliste_auftragsnr		VARCHAR(10)		,
	teileliste_auftragsnr_lokal	VARCHAR(10)		,
	teileliste_kundennr_lokal	NUMERIC(7)		,
	teileliste_gesperrt			CHAR(1)			,
	teileliste_gesperrt_von		VARCHAR(10)		,
	teileliste_gesperrt_am		NUMERIC(12)		,
	teileliste_privat			CHAR(1)			,
	teileliste_fzgdurchlauf		VARCHAR(40)		,
	teileliste_dringlichkeit	VARCHAR(6)		,
	teileliste_vin				CHAR(7)			,
	teileliste_rr_sap_status	CHAR(1)			)
	KEY IS teileliste_firma_id, teileliste_filiale_id, teileliste_user_id, teileliste_id;

CREATE SEQUENCE teileliste_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999 CYCLE;
CREATE SEQUENCE teileliste_score_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 99999 CYCLE;
-- Sequence fuer RR SAP Listen
CREATE SEQUENCE teileliste_rrsap_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999 CYCLE;

--  -----------------------------------------------------*
--   Teilelisteninformation
--  -----------------------------------------------------*

CREATE TABLE w_teileliste_sendeinfo (
	teilelistesi_firma_id		VARCHAR(10)	NOT NULL, 
	teilelistesi_filiale_id		VARCHAR(4)	NOT NULL, 
	teilelistesi_user_id		VARCHAR(10)	NOT NULL, 
	teilelistesi_teileliste_id	VARCHAR(20)	NOT NULL, 
	teilelistesi_satzart		CHAR(1)		,
	teilelistesi_auftragsnr		VARCHAR(10)	,
	teilelistesi_kundennr		INTEGER		,
	teilelistesi_greiferschein	CHAR(1)		,
	teilelistesi_rechnung		CHAR(1)		,
	teilelistesi_lieferschein	CHAR(1)		,
	teilelistesi_freitext		VARCHAR(150),
	teilelistesi_passwort		VARCHAR(10)	,
	teilelistesi_sondersteuerung TINYINT	,
	teilelistesi_gegeben_bar	NUMERIC(11,2),
	teilelistesi_gegeben_unbar	NUMERIC(11,2),
	teilelistesi_mitarbeiternr	NUMERIC(3)	) KEY IS teilelistesi_firma_id, teilelistesi_filiale_id, teilelistesi_user_id, teilelistesi_teileliste_id;

--  -----------------------------------------------------*
--   Teilelisten-Positionen
--  -----------------------------------------------------*

CREATE TABLE w_teilelistepos (
	teilelistepos_firma_id		VARCHAR(10)	NOT NULL, 
	teilelistepos_filiale_id	VARCHAR(4)	NOT NULL, 
	teilelistepos_user_id		VARCHAR(10)	NOT NULL, 
	teilelistepos_teileliste_id	VARCHAR(20)	NOT NULL, 
	teilelistepos_position		INTEGER		NOT NULL,
	teilelistepos_hgug			CHAR(4)		,
	teilelistepos_sachnr		CHAR(7)		NOT NULL,
	teilelistepos_benennung		VARCHAR(40)	,
	teilelistepos_zusatz		VARCHAR(15)	,
	teilelistepos_menge			NUMERIC(7,2),
	teilelistepos_lagerbestand	NUMERIC(10,2),
	teilelistepos_minimalbestand NUMERIC(10,2),
	teilelistepos_bedarfshinweis NUMERIC(2)	,
	teilelistepos_lagerort		VARCHAR(25)	,
	teilelistepos_aume			NUMERIC(9,2),
	teilelistepos_bemerkung		VARCHAR(20)	,
	teilelistepos_preis			NUMERIC(11,2),
	teilelistepos_rabatt		NUMERIC(5,2),
	teilelistepos_split			VARCHAR(2)	,
	teilelistepos_transparenz	VARCHAR(4)	,
	teilelistepos_suffix		CHAR(1)		,
	teilelistepos_dispocode		CHAR(1)		,
	teilelistepos_ruecksendepfl	CHAR(1)		,
	teilelistepos_mwst			NUMERIC(5,2),
	teilelistepos_altteil_steuer NUMERIC(5,2),
	teilelistepos_lokalteil		CHAR(1),
	teilelistepos_fistring		VARCHAR(128)	,
	teilelistepos_job_id		VARCHAR(20),
	teilelistepos_srp_id		VARCHAR(20),
	teilelistepos_status		SMALLINT,
	teilelistepos_pruefen		CHAR(1),
	teilelistepos_lock			CHAR(1),	
	teilelistepos_typ           VARCHAR(1),
    teilelistepos_ref           VARCHAR(7),
    teilelistepos_menge_org     NUMERIC(7,2)    ) KEY IS teilelistepos_firma_id, teilelistepos_filiale_id, teilelistepos_user_id, teilelistepos_teileliste_id, teilelistepos_position;

--  -----------------------------------------------------*
--   Teilelisten-JOBs
--  -----------------------------------------------------*

CREATE TABLE w_teileliste_job (
	teilelistejob_firma_id		VARCHAR(10)		NOT NULL, 
	teilelistejob_filiale_id	VARCHAR(4)		NOT NULL, 
	teilelistejob_user_id		VARCHAR(10)		NOT NULL, 
	teilelistejob_teileliste_id	VARCHAR(20)		NOT NULL,
	teilelistejob_job_id		VARCHAR(20)		NOT NULL, 
	teilelistejob_job_ben		VARCHAR(100),
	teilelistejob_lock			CHAR(1)			) KEY IS teilelistejob_firma_id, teilelistejob_filiale_id, teilelistejob_user_id, teilelistejob_teileliste_id, teilelistejob_job_id;

--  -----------------------------------------------------*
--   Teilelisten-SRPs
--  -----------------------------------------------------*

CREATE TABLE w_teileliste_srp (
	teilelistesrp_firma_id		VARCHAR(10)		NOT NULL, 
	teilelistesrp_filiale_id	VARCHAR(4)		NOT NULL, 
	teilelistesrp_user_id		VARCHAR(10)		NOT NULL,
	teilelistesrp_teileliste_id	VARCHAR(20)		NOT NULL, 
	teilelistesrp_srp_id		VARCHAR(20)		NOT NULL, 
	teilelistesrp_job_id		VARCHAR(20)		NOT NULL, 
	teilelistesrp_srp_ben		VARCHAR(100),
	teilelistesrp_lock			CHAR(1),
	teilelistesrp_quelle		VARCHAR(10)		) KEY IS teilelistesrp_firma_id, teilelistesrp_filiale_id, teilelistesrp_user_id, teilelistesrp_teileliste_id, teilelistesrp_srp_id, teilelistesrp_job_id;

--  -----------------------------------------------------*
--   Auftrag
--  -----------------------------------------------------*

CREATE TABLE w_auftrag (
	auftrag_firma_id		VARCHAR(10)		NOT NULL, 
	auftrag_filiale_id		VARCHAR(4)		NOT NULL,
	auftrag_auftragsnr		VARCHAR(10)		NOT NULL,
	auftrag_kundennr		INTEGER			,
	auftrag_kundenname		VARCHAR(20)		,	
	auftrag_fgstnr			CHAR(7)			) KEY IS auftrag_firma_id, auftrag_filiale_id, auftrag_auftragsnr;

--  -----------------------------------------------------*
--   Bestellliste
--  -----------------------------------------------------*

CREATE TABLE w_bestellliste (
	bestellliste_firma_id		VARCHAR(10)	NOT NULL,
	bestellliste_filiale_id		VARCHAR(4)	NOT NULL, 
	bestellliste_liste_id		VARCHAR(20)	NOT NULL, 
	bestellliste_gesperrt_von	VARCHAR(10)	,
	bestellliste_gesperrt_am	NUMERIC(12)	) KEY IS bestellliste_firma_id, bestellliste_filiale_id, bestellliste_liste_id;

--  -----------------------------------------------------*
--   Bestelllistepositionen
--  -----------------------------------------------------*

CREATE TABLE w_bestelllistepos (
	bestelllistepos_firma_id	VARCHAR(10)	NOT NULL, 
	bestelllistepos_filiale_id	VARCHAR(4)	NOT NULL, 
	bestelllistepos_liste_id	VARCHAR(20)	NOT NULL, 
	bestelllistepos_position	INTEGER		NOT NULL, 
	bestelllistepos_hgug		CHAR(4)		,
	bestelllistepos_sachnr		CHAR(7)		NOT NULL, 
	bestelllistepos_benennung	VARCHAR(40)	,
	bestelllistepos_zusatz		VARCHAR(15)	,
	bestelllistepos_menge		NUMERIC(7,2),
	bestelllistepos_lagerbestand NUMERIC(10,2),
	bestelllistepos_minimalbestand NUMERIC(10,2),
	bestelllistepos_bedarfshinweis NUMERIC(2)	,
	bestelllistepos_lagerort	VARCHAR(25)	,
	bestelllistepos_aume		NUMERIC(9,2),
	bestelllistepos_bemerkung	VARCHAR(20)	,
	bestelllistepos_auftragsnr	VARCHAR(10)	,
	bestelllistepos_kundennr	INTEGER		,
	bestelllistepos_lokalteil	CHAR(1)		) KEY IS bestelllistepos_firma_id, bestelllistepos_filiale_id, bestelllistepos_liste_id, bestelllistepos_position;

--  -----------------------------------------------------*
--   Notiz zu einem Teil
--  -----------------------------------------------------*

CREATE TABLE w_teileinfo (
	teileinfo_firma_id			VARCHAR(10)	NOT NULL,
	teileinfo_user_id			VARCHAR(10)	NOT NULL,
	teileinfo_sachnr			CHAR(7)		NOT NULL,
	teileinfo_allgemein			CHAR(1)		NOT NULL,
	teileinfo_notiz				VARCHAR(2000)	NOT NULL,
	teileinfo_gueltig_bis_monat	SMALLINT	,
	teileinfo_gueltig_bis_jahr	INTEGER		NOT NULL) KEY IS teileinfo_firma_id, teileinfo_user_id, teileinfo_sachnr;

ct;

--  -----------------------------------------------------*
--   welches Netz wird verwendet
--  -----------------------------------------------------*

CREATE TABLE w_netz (
	netz_netz					VARCHAR(12)	NOT NULL,
	netz_krit					VARCHAR(40)	NOT NULL);
ct;

--  -----------------------------------------------------*
--   welche Proxyinformation wird verwendet
--  -----------------------------------------------------*

CREATE TABLE w_proxy (
	proxy_proxyname			VARCHAR(64)		NOT NULL,
	proxy_port				NUMERIC(5)		NOT NULL,
	proxy_nutzername		VARCHAR(64)	,
	proxy_passwort			VARCHAR(64)	,
	proxy_realm				VARCHAR(64)	,
	proxy_ntdomain			VARCHAR(64)	,
	proxy_nthost			VARCHAR(64));
ct;

--  -----------------------------------------------------*
--   Tipps & Tricks (Steuertabelle)
--  -----------------------------------------------------*
CREATE TABLE w_tipp (
	tipp_id					NUMERIC(9)		NOT NULL,
	tipp_pos				SMALLINT		NOT NULL,
	tipp_filename			VARCHAR(255)	NOT NULL,
	tipp_art				VARCHAR(5)		NOT NULL,
	tipp_wichtig			CHAR(1)			NOT NULL) KEY IS tipp_id;

ct;

--  ------------------------------------------------------
--   Protokolltabelle für Logins und Logouts
--  ------------------------------------------------------

CREATE TABLE w_user_log (
	userlog_firma_id	VARCHAR(10)	NOT NULL,
	userlog_user_id		VARCHAR(10)	NOT NULL,
	userlog_eingeloggt	CHAR(1)		NOT NULL CHECK (userlog_eingeloggt = 'J' OR userlog_eingeloggt = 'N'),
	userlog_lastlogin	NUMERIC(12)	NOT NULL,
	userlog_anzahl_logins	INTEGER		NOT NULL
) KEY IS userlog_firma_id, userlog_user_id;

ct;

--  -----------------------------------------------------
--   Konfigurationstabelle für die Spaltendarstellung 
--   in Tabellen
--  -----------------------------------------------------

create table w_user_tabellenkonfig (
	usertk_firma_id			VARCHAR(10)	NOT NULL,
	usertk_user_id			VARCHAR(10)	NOT NULL,
	usertk_table_name		VARCHAR(50)	NOT NULL,
	usertk_zusatz			VARCHAR(50),
	usertk_column_name		VARCHAR(50)	NOT NULL,
	usertk_column_index		INTEGER		NOT NULL,
	CONSTRAINT		w_user_tabellenkonfig_fk1
		FOREIGN KEY (usertk_firma_id, usertk_user_id) REFERENCES w_user(user_firma_id, user_id)
		ON DELETE  CASCADE
) KEY IS usertk_firma_id, usertk_user_id, usertk_table_name, usertk_zusatz, usertk_column_name;

ct;

--  -----------------------------------------------------
--   Speichern von E-Mail-Optionen 
--   zb: Vorbelegung für Absender- und Empfänger-Adresse
--  -----------------------------------------------------

create table w_user_mailoptions (
	usermo_firma_id			VARCHAR(10)	NOT NULL,
	usermo_user_id			VARCHAR(10)	NOT NULL,
	usermo_krit_art			VARCHAR(50)	NOT NULL,
	usermo_krit_wert		VARCHAR(400)	NOT NULL,
	CONSTRAINT		w_user_mailoptions_fk1
		FOREIGN KEY (usermo_firma_id, usermo_user_id) REFERENCES w_user(user_firma_id, user_id)
		ON DELETE  CASCADE
) KEY IS usermo_firma_id, usermo_user_id, usermo_krit_art;

ct;


--  ******************************************************
--   Verwaltungstabellen (IPAC - Zubhör)
--  ******************************************************

--  -----------------------------------------------------*
--   Kundenstamm
--  -----------------------------------------------------*

CREATE TABLE w_zub_kunde (
	kunde_id				NUMERIC(9)		NOT NULL,
	kunde_anrede				VARCHAR(40)		,
	kunde_name				VARCHAR(40)		NOT NULL,
	kunde_vorname			VARCHAR(40)		,
	kunde_kundennummer		VARCHAR(10)		,
	kunde_strasse			VARCHAR(40)		,
	kunde_hausnummer		VARCHAR(40)		,
	kunde_land				VARCHAR(40)		,
	kunde_plz				VARCHAR(10)		,
	kunde_stadt				VARCHAR(40)		,
	kunde_postfachnummer	VARCHAR(10)		,
	kunde_telefon			VARCHAR(25)		,
	kunde_mobiltelefon		VARCHAR(25)		,
	kunde_faxnummer			VARCHAR(25)		,
	kunde_email			VARCHAR(40)		,
	kunde_bemerkung			VARCHAR(56)		,
	kunde_geburtsdatum		INTEGER			)		  KEY IS kunde_id;

ct;

CREATE SEQUENCE zub_kunde_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999999  CYCLE;

ct;

--  -----------------------------------------------------*
--   Kundenstamm - Fahrzeug
--  -----------------------------------------------------*

CREATE TABLE w_zub_kunde_fahrzeug (
	kundefzg_id				NUMERIC(9)		NOT NULL,
	kundefzg_vin			CHAR(7)			NOT NULL,
	kundefzg_kennzeichen	VARCHAR(20)		,
	CONSTRAINT		w_zub_kunde_fahrzeug_fk1
		FOREIGN KEY (kundefzg_id) REFERENCES w_zub_kunde(kunde_id)
		ON DELETE  NO ACTION
)		  KEY IS kundefzg_id, kundefzg_vin;

ct;

--  -----------------------------------------------------*
--   Anfrage
--  -----------------------------------------------------*
CREATE TABLE w_zub_anfrage (
	anfrage_id				NUMERIC(9)		NOT NULL,
	anfrage_marke_tps		VARCHAR(11)		NOT NULL,
	anfrage_produktart		CHAR(1)			NOT NULL,
	anfrage_name 			VARCHAR(40)		,
	anfrage_datum_anlage	INTEGER			NOT NULL,
	anfrage_user_id_anlage	VARCHAR(10)		NOT NULL,
	anfrage_datum_aender	INTEGER			,
	anfrage_user_id_aender	VARCHAR(10)		NOT NULL,
	anfrage_firma_id		VARCHAR(10)		NOT NULL,
	anfrage_filiale_id	VARCHAR(4)		NOT NULL,
	anfrage_gesperrt_von	VARCHAR(10)		,
)		  KEY IS anfrage_id;	

ct;

CREATE SEQUENCE zub_anfrage_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999999  CYCLE;

ct;

--  -----------------------------------------------------*
--   Anfrage - weitere Informationen
--  -----------------------------------------------------*

CREATE TABLE w_zub_anfrage_infos (
	anfragei_anfrage_id			NUMERIC(9)		NOT NULL,
	anfragei_kunde_id			NUMERIC(9)		,
	anfragei_kunde_anrede			VARCHAR(40)		,
	anfragei_kunde_name			VARCHAR(40)		,
	anfragei_kunde_vorname			VARCHAR(40)		,
	anfragei_kunde_kundennummer		VARCHAR(10)		,
	anfragei_kunde_strasse			VARCHAR(40)		,
	anfragei_kunde_hausnummer		VARCHAR(40)		,
	anfragei_kunde_land			VARCHAR(40)		,
	anfragei_kunde_plz			VARCHAR(10)		,
	anfragei_kunde_stadt			VARCHAR(40)		,
	anfragei_kunde_postfachnummer		VARCHAR(10)		,
	anfragei_kunde_telefon			VARCHAR(25)		,
	anfragei_kunde_mobiltelefon		VARCHAR(25)		,
	anfragei_kunde_faxnummer		VARCHAR(25)		,
	anfragei_kunde_email			VARCHAR(40)		,
	anfragei_bemerkung			VARCHAR(56)		,
	anfragei_stichworte			VARCHAR(500)		,
	CONSTRAINT		w_zub_anfrage_infos_fk1
		FOREIGN KEY (anfragei_anfrage_id) REFERENCES w_zub_anfrage(anfrage_id)
		ON DELETE  NO ACTION,
	CONSTRAINT		w_zub_anfrage_infos_fk2
		FOREIGN KEY (anfragei_kunde_id) REFERENCES w_zub_kunde(kunde_id)
		ON DELETE  NO ACTION
)		  KEY IS anfragei_anfrage_id;

ct;

--  -----------------------------------------------------*
--   Vorgang
--  -----------------------------------------------------*

CREATE TABLE w_zub_vorgang (
	vorgang_anfrage_id		NUMERIC(9)		NOT NULL,
	vorgang_id				NUMERIC(9)		NOT NULL,
	vorgang_produkt_btnr	CHAR(7)			NOT NULL,
	vorgang_bildposnr		CHAR(2)			,
	vorgang_produkt_name	VARCHAR(100)	NOT NULL,
	vorgang_datum_anlage	INTEGER			NOT NULL,
	vorgang_datum_aender	INTEGER			,
	vorgang_hkid			INTEGER			,
	vorgang_ukid			INTEGER			, 
	valid 			CHAR(1)  DEFAULT 'J',
	CONSTRAINT		w_zub_vorgang_fk1
		FOREIGN KEY (vorgang_anfrage_id) REFERENCES w_zub_anfrage(anfrage_id)
		ON DELETE  NO ACTION
)		  KEY IS vorgang_id;

ct;

CREATE SEQUENCE zub_vorgang_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999999  CYCLE;

ct;

--  -----------------------------------------------------*
--   Vorgang - Fahrzeuginformation
--  -----------------------------------------------------*

CREATE TABLE w_zub_vorgang_fahrzeug (
	vorgangfzg_vorgang_id	NUMERIC(9)		NOT NULL,
	vorgangfzg_kritart		VARCHAR(10)		NOT NULL,
	vorgangfzg_kritwert		VARCHAR(40)		NOT NULL,
	CONSTRAINT		w_zub_vorgang_fahrzeug_fk1
		FOREIGN KEY (vorgangfzg_vorgang_id) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE  NO ACTION
) KEY IS vorgangfzg_vorgang_id, vorgangfzg_kritart;

ct;

--  -----------------------------------------------------*
--   Vorgang - Bedingung
--  -----------------------------------------------------*

CREATE TABLE w_zub_vorgang_bedingung (
	vorgangbed_vorgang_id	NUMERIC(9)		NOT NULL,
	vorgangbed_kez		VARCHAR(10)		NOT NULL,
	vorgangbed_text		VARCHAR(140)		NOT NULL,
	vorgangbed_wert		CHAR(1)			NOT NULL,
	CONSTRAINT		w_zub_vorgang_bedingung_fk1
		FOREIGN KEY (vorgangbed_vorgang_id) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE  NO ACTION
) KEY IS vorgangbed_vorgang_id, vorgangbed_kez;

ct;

--  -----------------------------------------------------*
--   Vorgang - Konfiguration
--  -----------------------------------------------------*



CREATE TABLE w_zub_vorgang_konfiguration (
	vorgangk_vorgang_id		NUMERIC(9)		NOT NULL,
	vorgangk_konfig_id	NUMERIC(9)		NOT NULL,
	vorgangk_konfig_name		VARCHAR(80)		NOT NULL,
	vorgangk_aufabschlag		NUMERIC(11,2)		,
	vorgangk_konfig_id_vorlage	NUMERIC(9)		,
	vorgangk_variante_id		NUMERIC(9)		,
	vorgangk_alternative_bildpos CHAR(2) ,
	vorgangk_bildpos_optional   VARCHAR(50)    ,
	CONSTRAINT		w_zub_vorgang_konfiguration_fk1
		FOREIGN KEY (vorgangk_vorgang_id) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE  NO ACTION,
	CONSTRAINT		w_zub_vorgang_konfiguration_fk2
		FOREIGN KEY (vorgangk_konfig_id_vorlage) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE  NO ACTION
) KEY IS vorgangk_konfig_id;

ct;	

CREATE TABLE w_zub_vorgang_konfig_position (
	vorgangkp_konfig_id	NUMERIC(9)		NOT NULL,
	vorgangkp_pos			NUMERIC(3)		NOT NULL,
	vorgangkp_gruppe			VARCHAR(11)		NOT NULL,
	vorgangkp_elementart		VARCHAR(20)		,
	vorgangkp_status			VARCHAR(10)		NOT NULL,
	vorgangkp_artikel_art	CHAR(1)			NOT NULL,
	vorgangkp_artikel_nummer	VARCHAR(35)		NOT NULL,
	vorgangkp_artikel_ben	VARCHAR(100)	NOT NULL,
	vorgangkp_variante_id	NUMERIC(9)		,
	vorgangkp_menge			NUMERIC(4)	NOT NULL,
	vorgangkp_preis_netto	NUMERIC(11,2)	NOT NULL,
	vorgangkp_rabatt			NUMERIC(5,2)	,
	vorgangkp_mwst_satz			NUMERIC(5,2)	,
	vorgangkp_mwst_betrag		NUMERIC(11,2)	,
	vorgangkp_comment 		VARCHAR(56)	,
	CONSTRAINT		w_zub_vorgang_konfig_pos_fk1
		FOREIGN KEY (vorgangkp_konfig_id) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE  NO ACTION
)         KEY IS vorgangkp_konfig_id, vorgangkp_pos;

ct;

CREATE SEQUENCE zub_konfiguration_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999999  CYCLE;

ct;

--  -----------------------------------------------------*
--   Vorgang - Angebot
--  -----------------------------------------------------*

CREATE TABLE w_zub_konfig_angebot (
	vorganga_konfig_id				NUMERIC(9)		NOT NULL,
	vorganga_angebotsnummer			NUMERIC(9)		NOT NULL,
	vorganga_gesamt2_netto			NUMERIC(11,2)	NOT NULL,
	vorganga_gesamt2_brutto			NUMERIC(11,2)	NOT NULL,
	vorganga_status					VARCHAR(10)		NOT NULL,
	vorganga_status_datum			INTEGER			NOT NULL,
	vorganga_datum_anlage			INTEGER			NOT NULL,
	vorganga_bindefrist				INTEGER			NOT NULL,
	vorganga_user_firma_id			VARCHAR(10)		NOT NULL,
	vorganga_user_id				VARCHAR(10)		NOT NULL,
	vorganga_kunde_id				NUMERIC(9)		,
	vorganga_kunde_anrede			VARCHAR(40)		,
	vorganga_kunde_name				VARCHAR(40)		,
	vorganga_kunde_vorname			VARCHAR(40)		,
	vorganga_kunde_kundennummer		VARCHAR(10)		,
	vorganga_kunde_strasse			VARCHAR(40)		,
	vorganga_kunde_hausnummer		VARCHAR(40)		,
	vorganga_kunde_land				VARCHAR(40)		,
	vorganga_kunde_plz				VARCHAR(10)		,
	vorganga_kunde_stadt			VARCHAR(40)		,
	vorganga_kunde_postfachnummer	VARCHAR(10)		,
	vorganga_kunde_telefon			VARCHAR(25)		,
	vorganga_kunde_mobiltelefon		VARCHAR(25)		,
	vorganga_kunde_faxnummer		VARCHAR(25)		,
	vorganga_kunde_email			VARCHAR(40)		,
	vorganga_angebotsname			VARCHAR(100)	,
	vorganga_an_ispa				CHAR(1)			,
	vorganga_bemerkung				VARCHAR(56)		,
	CONSTRAINT		w_zub_konfig_angebot_fk1
		FOREIGN KEY (vorganga_konfig_id) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE  NO ACTION,
	CONSTRAINT		w_zub_konfig_angebot_fk3
		FOREIGN KEY (vorganga_kunde_id) REFERENCES w_zub_kunde(kunde_id)
		ON DELETE  NO ACTION
) KEY IS vorganga_konfig_id;

ct;

CREATE SEQUENCE zub_angebotsnr_id_seq START WITH 1 INCREMENT BY 1 MAXVALUE 999999999  CYCLE;

ct;


--  -----------------------------------------------------*
--   User-Informationen (zuletzt angesehene Angebote etc.)
--  -----------------------------------------------------*

CREATE TABLE w_zub_user_lastseen (
	userls_user_id					VARCHAR(10)	NOT NULL,
	userls_user_firma_id				VARCHAR(10)	NOT NULL,
	userls_anfrage_id				NUMERIC(9)	NOT NULL,
	userls_vorgang_id_last			NUMERIC(9)	NOT NULL,
	userls_konfig_id_last		NUMERIC(9)	,
	userls_konfig_id_lastsicht	VARCHAR(11)	,
	CONSTRAINT		w_zub_user_lastseen_fk2
		FOREIGN KEY (userls_anfrage_id) REFERENCES w_zub_anfrage(anfrage_id)
		ON DELETE  NO ACTION,
	CONSTRAINT		w_zub_user_lastseen_fk3
		FOREIGN KEY (userls_vorgang_id_last) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE  NO ACTION,
	CONSTRAINT		w_zub_user_lastseen_fk4
		FOREIGN KEY (userls_konfig_id_last) REFERENCES w_zub_vorgang_konfiguration (vorgangk_konfig_id)
		ON DELETE  NO ACTION
)	 KEY IS userls_user_id, userls_anfrage_id;

ct;

--  -----------------------------------------------------*
--   IPAC-Konfiguration
--  -----------------------------------------------------*
-- shc 13.09.2007 : entfernt - nun w_zub_arbeit 
-- CREATE TABLE w_zub_konfiguration (
--	konfig_firma_id			VARCHAR(10)		NOT NULL,
--	konfig_filiale_id		VARCHAR(4)		NOT NULL,
--	konfig_kritart			VARCHAR(25)		NOT NULL,
--	konfig_kritwert			VARCHAR(15)		NOT NULL,
--	CONSTRAINT		w_zub_konfiguration_fk1
--		FOREIGN KEY (konfig_firma_id, konfig_filiale_id) REFERENCES w_filiale(filiale_firma_id, filiale_id)
--		ON DELETE  NO ACTION,
-- ) KEY IS konfig_firma_id, konfig_filiale_id, konfig_kritart;
-- ct;

--  -----------------------------------------------------*
--  -----------------------------------------------------*
--   Letzter Vorgang zur Anfrage
--  -----------------------------------------------------*
CREATE TABLE w_zub_user_anfrage_lastseen (
	userals_user_id			VARCHAR(10)		NOT NULL,
	userals_user_firma_id	VARCHAR(10)		NOT NULL,
	userals_anfrage_id		NUMERIC(9)		NOT NULL,
	userals_vorgang_id_last	NUMERIC(9)		NOT NULL,
	userals_datum			DATE			NOT NULL,
	CONSTRAINT		w_zub_anfrage_lastseen_fk2
		FOREIGN KEY (userals_anfrage_id) REFERENCES w_zub_anfrage(anfrage_id)
		ON DELETE  NO ACTION,
	CONSTRAINT  	w_zub_anfrage_lastseen_fk3
		FOREIGN KEY (userals_vorgang_id_last) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE NO ACTION
) KEY IS userals_user_id, userals_anfrage_id;
ct;

--  -----------------------------------------------------*
--   Letzte Konfiguration zum Vorgang
--  -----------------------------------------------------*
CREATE TABLE w_zub_user_vorgang_lastseen (
	uservls_user_id			VARCHAR(10)		NOT NULL,
	uservls_user_firma_id	VARCHAR(10)		NOT NULL,
	uservls_vorgang_id		NUMERIC(9)		NOT NULL,
	uservls_konfig_id_last	NUMERIC(9)		NOT NULL,
	uservls_datum			DATE			NOT NULL,
	CONSTRAINT		w_zub_vorgang_lastseen_fk2
		FOREIGN KEY (uservls_vorgang_id) REFERENCES w_zub_vorgang(vorgang_id)
		ON DELETE  NO ACTION,
	CONSTRAINT  	w_zub_vorgang_lastseen_fk3
		FOREIGN KEY (uservls_konfig_id_last) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE NO ACTION
) KEY IS uservls_user_id, uservls_vorgang_id;
ct;

--  -----------------------------------------------------*
--   Letzte Konfiguration zum Vorgang
--  -----------------------------------------------------*
CREATE TABLE w_zub_user_konfig_lastseen (
	userkls_user_id			VARCHAR(10)		NOT NULL,
	userkls_user_firma_id	VARCHAR(10)		NOT NULL,
	userkls_konfig_id		NUMERIC(9)		NOT NULL,
	userkls_view_id_last	VARCHAR(11)		NOT NULL,
	userkls_datum			DATE			NOT NULL,
	CONSTRAINT		w_zub_konfig_lastseen_fk2
		FOREIGN KEY (userkls_konfig_id) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE  NO ACTION
) KEY IS userkls_user_id, userkls_konfig_id;
ct;

--  -----------------------------------------------------*
--   Historie fuer RR SAP Anfragen
--  -----------------------------------------------------*
CREATE TABLE w_teileliste_hist (
	teilelistehist_firma_id		VARCHAR(10)		NOT NULL,
	teilelistehist_id			VARCHAR(20)		NOT NULL,
	teilelistehist_user_id		VARCHAR(10)		NOT NULL,
	teilelistehist_datum		TIMESTAMP		NOT NULL,
	teilelistehist_abfrage_id	NUMERIC(9)		NOT NULL,
	teilelistehist_funktion		VARCHAR(40)		NOT NULL
) KEY IS teilelistehist_firma_id, teilelistehist_id, teilelistehist_user_id, teilelistehist_datum;
ct;

--  -----------------------------------------------------*
--   Nutzerdaten fuer RR SAP Anfragen
--  -----------------------------------------------------*
CREATE TABLE w_user_rr (
	user_rr_firma_id	VARCHAR(10)		NOT NULL,
	user_rr_id			VARCHAR(10)		NOT NULL,
	user_rr_name		VARCHAR(50)				,
	user_rr_telefon		VARCHAR(20)				,
	user_rr_email		VARCHAR(50)				,
	user_rr_haendlernr	VARCHAR(5)		NOT NULL
) KEY IS user_rr_firma_id, user_rr_id;
ct;

ct;

--  -----------------------------------------------------*
--   Konfiguration der Aufwände
--  -----------------------------------------------------*
CREATE TABLE w_zub_arbeit(
	arbeit_firma_id	Varchar(10) NOT NULL,
	arbeit_geltungsbereich_art	Varchar(3) NOT NULL,
	arbeit_geltungsbereich_id	Varchar(20) NOT NULL,
	arbeit_marke_tps	Varchar(11) NOT NULL,
	arbeit_produktart	Varchar(1) NOT NULL,
	arbeit_aufwand_id	Varchar(20) NOT NULL,
	arbeit_art			Varchar(30) NOT NULL,
	arbeit_kritart	Varchar(25) NOT NULL,
	arbeit_kritwert	Varchar(100) NOT NULL,
PRIMARY KEY (arbeit_firma_id, arbeit_geltungsbereich_art, arbeit_geltungsbereich_id, arbeit_marke_tps, arbeit_produktart, arbeit_aufwand_id, arbeit_art, arbeit_kritart)
);

CREATE INDEX w_zub_arbeit_idx on w_zub_arbeit(arbeit_firma_id, arbeit_geltungsbereich_art, arbeit_geltungsbereich_id, arbeit_marke_tps, arbeit_produktart, arbeit_aufwand_id, arbeit_art, arbeit_kritart);

--  -----------------------------------------------------*
--   IPAC-Admin-Erweiterungen zum User
--  -----------------------------------------------------*

CREATE TABLE w_zub_user(
	userz_firma_id	Varchar(10) NOT NULL,
	userz_id	Varchar(10) NOT NULL,
	userz_real_name	Varchar(50),
	userz_telefon	Varchar(20),
	userz_email	Varchar(50),
	userz_agb_bestaetigt char(1),
PRIMARY KEY (userz_firma_id, userz_id)
);

CREATE INDEX w_zub_user_idx on w_zub_user(userz_firma_id, userz_id);

ALTER TABLE w_zub_user add constraint w_zub_user_fk foreign key (userz_firma_id, userz_id) references w_user (user_firma_id, user_id);

--  -----------------------------------------------------*
--   IPAC-Admin-Erweiterungen zur Filiale
--  -----------------------------------------------------*
CREATE TABLE w_zub_konfig(
	konfigz_firma_id	Varchar(10) NOT NULL,
	konfigz_filiale_id	Varchar(4) NOT NULL,
	konfigz_fax	Varchar(20),
	konfigz_email	Varchar(50),
	konfigz_default_markt_id	Integer,
	konfigz_speicher_kunden	Char(1),
	konfigz_verfuegbarkeit_pruefen	Char(1),
PRIMARY KEY (konfigz_firma_id, konfigz_filiale_id)
);

CREATE INDEX w_zub_konfig_idx on w_zub_konfig(konfigz_firma_id, konfigz_filiale_id);

ALTER TABLE w_zub_konfig add constraint w_zub_konfig_fk foreign key (konfigz_firma_id, konfigz_filiale_id) references w_konfig(konfig_firma_id, konfig_filiale_id);


-- Neue Tabelle w_zub_vorgang_konfiguration_bnb zur Speicherung der selektierten BNBs einer Konfiguration
CREATE TABLE w_zub_vorgang_konfiguration_bnb(
	vorgangkbnb_konfig_id			NUMERIC(9)	NOT NULL,
	vorgangkbnb_bildposnr			CHAR(2)		NOT NULL,
	vorgangkbnb_elementart			VARCHAR(20)     NOT NULL,
	CONSTRAINT		w_zub_vorgang_konfig_bnb_fk1
		FOREIGN KEY (vorgangkbnb_konfig_id) REFERENCES w_zub_vorgang_konfiguration(vorgangk_konfig_id)
		ON DELETE  NO ACTION
	)         KEY IS vorgangkbnb_konfig_id, vorgangkbnb_bildposnr;


-- Neue Tabelle w_zub_vorgang_konfiguration_bnb zur Speicherung der Varianten pro BNB

CREATE TABLE w_zub_vorgang_konfig_bnb_var(
	vorgangkbvar_konfig_id			NUMERIC(9)	NOT NULL,
	vorgangkbvar_bildposnr			CHAR(2)		NOT NULL,
	vorgangkbvar_variante_id		NUMERIC(9)	NOT NULL,
	CONSTRAINT		w_zub_vorgang_konf_bnb_var_fk1
		FOREIGN KEY (vorgangkbvar_konfig_id, vorgangkbvar_bildposnr) REFERENCES w_zub_vorgang_konfiguration_bnb(vorgangkbnb_konfig_id, vorgangkbnb_bildposnr )
		ON DELETE  NO ACTION
	) KEY IS vorgangkbvar_konfig_id, vorgangkbvar_bildposnr, vorgangkbvar_variante_id;

ct;

-- Neue Tabelle w_dealer_type um Markt und Händlerart abzulegen

CREATE TABLE w_dealer_type (id INTEGER NOT NULL, markt_id INTEGER NOT NULL, dealer_type INTEGER NOT NULL);
ct;

INSERT INTO w_dealer_type (id, markt_id, dealer_type) VALUES (1, -1, -1);
ct;

