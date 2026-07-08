# Composeapelago Setup Guide

## What You Need

- Archipelago `0.6.6` or newer
- The Composeapelago .apworld
- The Composeapelago webapp (the client), running in a desktop browser
- Optional for development: MIDI files to add to the bundled song library

## Install the AP World

1. Once Archipelago is installed, double click composeapelago.apworld and wait
   for the pop-up to say it installed successfully.
2. Restart Archipelago tools if they were already open.

## Generate a Seed

1. Open your YAML template.
2. Pick a `location_mode`: `per_note` gives one check per melody note,
   `bars` gives one check per completed bar. The song is chosen randomly
   by the installed apworld, and the counts come from that song.
3. Generate normally through Archipelago.

## Connect the Webapp

1. Start the webapp (`npm run dev` in the webapp folder) and open it in a
   desktop browser.
2. Enter your host, port, and slot name in the connection panel and press
   Connect. The seed's song loads automatically.
3. Start writing what you hear.

## Play

- Received pitch and note value items unlock entry tools in the webapp;
  backing track items un-mute the accompaniment.
- Each correct note (or completed bar) sends the next location check.
- Reaching 100% melody completion sends the goal.
