;
; after starting tbtar or tbarc
;
update systable set ttype = 'V' where tname = 'sysconstraint';
drop view sysconstraint;
create view sysconstraint
    (segno,constraintname,attributes, constrainttext,cpos,ubtrees) as
	select 
	segno, constraintname, attributes, constrainttext, 
	cpos,ubtrees from "@@sysconstraint";
update systable set ttype = 'v' where tname = 'sysconstraint';
ct

