// Shows the current song tracks. The melody is what the player writes;
// backing tracks stay muted until their Archipelago items arrive.

import type { Song, TrackSummary } from "./song";
import type { Unlocks } from "./unlocks";

interface TrackListProps {
  song: Song;
  tracks: TrackSummary[];
  unlocks: Unlocks;
  titleRevealed: boolean;
}

export function TrackList(props: TrackListProps) {
  const { song, tracks, unlocks, titleRevealed } = props;

  function rowFor(trackIndex: number) {
    return tracks.find((track) => track.index === trackIndex);
  }

  const melody = rowFor(song.melodyTrackIndex);

  return (
    <div className="track-picker">
      <div className="song-row">
        <strong>{titleRevealed ? song.definition.name : "unknown song"}</strong>
        <span className="status-text">{titleRevealed ? "song title revealed" : "find Song Title Reveal"}</span>
      </div>

      <table className="track-table">
        <thead>
          <tr><th>Status</th><th>Track</th><th>Instrument</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr className="selected">
            <td>This is the part you write</td>
            <td>{melody?.name}</td>
            <td>{melody?.instrument}</td>
            <td>{melody?.noteCount}</td>
          </tr>
          {song.definition.backingTracks.map((backing) => {
            const track = rowFor(backing.trackIndex);
            const unlocked = unlocks.has(backing.itemName);
            return (
              <tr key={backing.itemName} className={unlocked ? "" : "locked-track"}>
                <td>{unlocked ? "unlocked" : `locked: ${backing.itemName}`}</td>
                <td>{track?.name}</td>
                <td>{track?.instrument}</td>
                <td>{track?.noteCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
