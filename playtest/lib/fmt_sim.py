import json,sys
d=json.load(sys.stdin)
for k in ['winAll','win1to5','win6to15','firstWinRun','firstWinGot','reachedBoss','firstRunMinutes','avgRunMinutes','avgPayout','freeRuns','firstUpgradeRun','firstTalentRun','firstPageRun','firstPageGot','firstTierRun','firstTierGot','combosEnd','itemsEnd','animalsEnd','pagesEnd','tierEnd','deaths','meanRounds']:
    print(k.ljust(16),' | '.join(str(d[s][k]).replace("'",'').replace('combat','c').replace('elite','e').replace('boss','b').ljust(24) for s in d))
