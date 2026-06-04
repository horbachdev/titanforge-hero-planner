# Ress Formula Index

Generated from `data/raw/ress-hero-quest-simulator.xlsx` at 2026-06-02T21:15:37.239Z.

The complete raw formula dump is stored in `data/raw/ress-formula-dump.json`.

| Sheet | Used range | Formula cells |
| --- | ---: | ---: |
| Intro | A1:C100 | 142 |
| Quest Sim | A1:AA227 | 396 |
| Hero Data | A1:V76 | 118 |
| Hero 1 | A1:CH175 | 1.657 |
| Hero 2 | A1:CH175 | 1.657 |
| Hero 3 | A1:CH175 | 1.657 |
| Hero 4 | A1:CH175 | 1.657 |
| Hero 5 | A1:CH175 | 1.657 |
| Champion 1 | A1:BI400 | 8.742 |
| Quest Data | A1:AB200 | 1.330 |
| Eq Data | A1:M2000 | 18.322 |
| Hero Stats | A1:BK300 | 8.840 |
| Skill Data | A1:CN200 | 9.901 |

## Quest Sim

Formula cells: 396  
Used range: `A1:AA227`

- `Quest Sim!Z1`: `VLOOKUP(A11,'Quest Data'!$B$2:$AB$1000,25,0)`
- `Quest Sim!AA1`: `if('Quest Data'!A3,'Quest Data'!B3,"")`
- `Quest Sim!Z2`: `VLOOKUP(A11,'Quest Data'!$B$2:$AB$1000,26,0)`
- `Quest Sim!AA2`: `if('Quest Data'!A4,'Quest Data'!B4,"")`
- `Quest Sim!B3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,2,0),"None")`
- `Quest Sim!C3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,3,0),0)`
- `Quest Sim!D3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,4,0),"None")`
- `Quest Sim!E3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,5,0),0)`
- `Quest Sim!F3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,6,0),0)`
- `Quest Sim!G3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,7,0),0)`
- `Quest Sim!H3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,8,0),0)`
- `Quest Sim!I3`: `IFERROR(VLOOKUP($A3,'Hero Data'!$A$3:$Q$500,9,0),0)`

## Hero 1

Formula cells: 1.657  
Used range: `A1:CH175`

- `Hero 1!R2`: `if($B$2="Yes",AD2,Z2)`
- `Hero 1!S2`: `if($B$2="Yes",AE2,AA2)`
- `Hero 1!T2`: `if($B$2="Yes",AF2,AB2)`
- `Hero 1!W2`: `HLOOKUP(B3,R1:T8,2,0)`
- `Hero 1!X2`: `HLOOKUP(B3,AH1:AJ8,2,0)`
- `Hero 1!AM2`: `countif($AH$2:$AJ$7,AL2)`
- `Hero 1!AO2`: `VLOOKUP(B28,'Quest Data'!$B$2:$AB$1000,25,0)`
- `Hero 1!AP2`: `if(B29="Easy",0,if(B29="Medium",1,if(B29="Hard",2,if(B29="Extreme",3,0))))`
- `Hero 1!R3`: `if($B$2="Yes",AD3,Z3)`
- `Hero 1!S3`: `if($B$2="Yes",AE3,AA3)`
- `Hero 1!T3`: `if($B$2="Yes",AF3,AB3)`
- `Hero 1!W3`: `HLOOKUP(B3,R1:T8,3,0)`

## Champion 1

Formula cells: 8.742  
Used range: `A1:BI400`

- `Champion 1!E4`: `B2`
- `Champion 1!E5`: `round((index(N6:Y76,match(B3,M6:M76,0)+if(B13="Yes",2,0),match(B2,N5:Y5,0))*if(B13="Yes",1.5,1)+index(C358:AZ369,match(B2,N5:Y5,0),B4)+B10+AY22+AW28)*(1+AX28/100+AY5),0)`
- `Champion 1!AY5`: `if(B19=1,0.05,if(B19=2,0.1,if(B19=3,0.25,0)))`
- `Champion 1!E6`: `Round((index(N80:Y150,match(B3,M6:M76,0)+if(B13="Yes",2,0),match(B2,N5:Y5,0))*if(B13="Yes",1.5,1)+index(C373:AZ384,match(B2,N5:Y5,0),B4)+B11*4+AU22+AS28)*(1+AT28/100+AY5),0)`
- `Champion 1!M6`: `if($B$2="Reinhold",AX44,AW44)`
- `Champion 1!N6`: `sum(AE$6:AE6)`
- `Champion 1!O6`: `sum(AF$6:AF6)`
- `Champion 1!P6`: `sum(AG$6:AG6)`
- `Champion 1!Q6`: `sum(AH$6:AH6)`
- `Champion 1!R6`: `sum(AI$6:AI6)`
- `Champion 1!S6`: `sum(AJ$6:AJ6)`
- `Champion 1!T6`: `sum(AK$6:AK6)`

## Quest Data

Formula cells: 1.330  
Used range: `A1:AB200`

- `Quest Data!B1`: `IFERROR(__xludf.DUMMYFUNCTION("IMPORTRANGE(""https://docs.google.com/spreadsheets/d/1nQCu8NDWFLANauYLL_sbBXKrsSjFnmD5BfRyzp_EqWU"",""Quest_Data_new!A1:AA200"")"),"")`
- `Quest Data!F1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"HP ")`
- `Quest Data!J1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Defense Cap")`
- `Quest Data!N1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Attack")`
- `Quest Data!R1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Aoe Damage")`
- `Quest Data!V1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Barrier HP")`
- `Quest Data!B2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Quest Zone")`
- `Quest Data!C2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"LCoG")`
- `Quest Data!D2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Boss")`
- `Quest Data!E2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"AoE Chance [%]")`
- `Quest Data!F2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Easy")`
- `Quest Data!G2`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Medium")`

## Eq Data

Formula cells: 18.322  
Used range: `A1:M2000`

- `Eq Data!A1`: `IFERROR(__xludf.DUMMYFUNCTION("IMPORTRANGE(""https://docs.google.com/spreadsheets/d/1nQCu8NDWFLANauYLL_sbBXKrsSjFnmD5BfRyzp_EqWU"",""Eq_Data!A1:M2000"")"),"Rogue Hat")`
- `Eq Data!B1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Canopy Cap (DEF) - T1")`
- `Eq Data!C1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),1.0)`
- `Eq Data!D1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)`
- `Eq Data!E1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),16.0)`
- `Eq Data!F1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)`
- `Eq Data!G1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)`
- `Eq Data!H1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)`
- `Eq Data!J1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Earth")`
- `Eq Data!K1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"NONE")`
- `Eq Data!L1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Yes")`
- `Eq Data!M1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Yes")`

## Hero Stats

Formula cells: 8.840  
Used range: `A1:BK300`

- `Hero Stats!A1`: `IFERROR(__xludf.DUMMYFUNCTION("IMPORTRANGE(""https://docs.google.com/spreadsheets/d/1nQCu8NDWFLANauYLL_sbBXKrsSjFnmD5BfRyzp_EqWU"",""Hero Data New!A1:BL300"")"),"HP")`
- `Hero Stats!B1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),1.0)`
- `Hero Stats!C1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),2.0)`
- `Hero Stats!D1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),3.0)`
- `Hero Stats!E1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),4.0)`
- `Hero Stats!F1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),5.0)`
- `Hero Stats!G1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),6.0)`
- `Hero Stats!H1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),7.0)`
- `Hero Stats!I1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),8.0)`
- `Hero Stats!J1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),9.0)`
- `Hero Stats!K1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),10.0)`
- `Hero Stats!L1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),11.0)`

## Skill Data

Formula cells: 9.901  
Used range: `A1:CN200`

- `Skill Data!A1`: `IFERROR(__xludf.DUMMYFUNCTION("IMPORTRANGE(""https://docs.google.com/spreadsheets/d/1nQCu8NDWFLANauYLL_sbBXKrsSjFnmD5BfRyzp_EqWU"",""Skill Data New!A1:CN200"")"),"")`
- `Skill Data!F1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 1")`
- `Skill Data!G1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 2")`
- `Skill Data!H1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 3")`
- `Skill Data!I1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 4")`
- `Skill Data!J1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 1")`
- `Skill Data!K1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 2")`
- `Skill Data!L1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 3")`
- `Skill Data!M1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 4")`
- `Skill Data!N1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 1")`
- `Skill Data!O1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 2")`
- `Skill Data!P1`: `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"Tier 3")`
