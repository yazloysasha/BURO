#!/usr/bin/env bash
# Converts selected Kenney CC0 .ogg sounds to .m4a (AAC 96k) + .mp3. Usage: build_sfx.sh <raw_dir> <BURO/assets/sfx>
set -euo pipefail
RAW="$1"; OUT="$2"; mkdir -p "$OUT"
I="$RAW/interface-sounds/Audio"; R="$RAW/rpg-audio/Audio"; M="$RAW/impact-sounds/Audio"
N="$RAW/music-jingles/Audio/8-Bit jingles"; Z="$RAW/music-jingles/Audio/Pizzicato jingles"; H="$RAW/music-jingles/Audio/Hit jingles"
while read -r name src; do
  [ -z "$name" ] && continue
  ffmpeg -loglevel error -y -i "$src" -ac 2 -c:a aac -b:a 96k "$OUT/$name.m4a"
  ffmpeg -loglevel error -y -i "$src" -ac 2 -c:a libmp3lame -b:a 96k "$OUT/$name.mp3"
  echo "$name	${src#$RAW/}" >> "$OUT/.map.tsv"
done <<EOF
click $I/click_002.ogg
tap $I/tick_002.ogg
select $I/select_003.ogg
confirm $I/confirmation_001.ogg
confirm_big $I/confirmation_004.ogg
error $I/error_006.ogg
back $I/back_002.ogg
open $I/open_002.ogg
close $I/close_002.ogg
toggle $I/toggle_002.ogg
scroll $I/scroll_002.ogg
question $I/question_001.ogg
glitch $I/glitch_002.ogg
glitch_2 $I/glitch_004.ogg
drop $I/drop_002.ogg
sticker_peel $I/pluck_001.ogg
shiny $I/glass_002.ogg
meow_sub $I/question_002.ogg
meow_sub_2 $I/pluck_002.ogg
lootbox_open_common $I/open_001.ogg
coin $R/handleCoins.ogg
coin_small $R/handleCoins2.ogg
chest_open $R/metalLatch.ogg
door_open $R/doorOpen_1.ogg
door_close $R/doorClose_2.ogg
creak $R/creak1.ogg
page_flip $R/bookFlip1.ogg
sticker_place $R/bookPlace1.ogg
equip $R/beltHandle1.ogg
miss $R/cloth1.ogg
scratch $R/knifeSlice.ogg
potion $R/metalPot1.ogg
hit_soft $M/impactSoft_medium_001.ogg
hit_medium $M/impactPunch_medium_002.ogg
hit_hard $M/impactPunch_heavy_001.ogg
squish $M/impactSoft_heavy_001.ogg
lootbox_shake $M/impactWood_light_002.ogg
shelf_place $M/impactWood_medium_001.ogg
ambush $M/impactBell_heavy_001.ogg
wash_sub $M/footstep_snow_001.ogg
step $M/footstep_wood_001.ogg
jingle_win $N/jingles_NES12.ogg
jingle_lose $N/jingles_NES00.ogg
level_up $N/jingles_NES08.ogg
album_page $N/jingles_NES05.ogg
lootbox_open_rare $N/jingles_NES03.ogg
daily_gift $Z/jingles_PIZZI02.ogg
jingle_legendary $Z/jingles_PIZZI15.ogg
fail_small $Z/jingles_PIZZI07.ogg
lootbox_open_epic $H/jingles_HIT06.ogg
lootbox_open_legendary $H/jingles_HIT15.ogg
crit $H/jingles_HIT03.ogg
EOF
