import { z } from 'zod';
import type { tool, SpotifyHandlerExtra } from './types.js';

// GetSongBPM API configuration
const GETSONGBPM_API_KEY = process.env.GETSONGBPM_API_KEY || '';
const GETSONGBPM_BASE_URL = 'https://api.getsongbpm.com';

interface GetSongBPMSearchResult {
  song_id: string;
  song_title: string;
  song_uri: string;
  artist: {
    name: string;
  };
  tempo?: string;
  time_sig?: string;
  song_key?: string;
}

interface GetSongBPMSongData {
  song: {
    id: string;
    title: string;
    artist: {
      name: string;
    };
    tempo?: string;
    time_sig?: string;
    key_of?: string;
  };
}

async function searchGetSongBPM(trackName: string, artistName: string): Promise<GetSongBPMSearchResult | null> {
  if (!GETSONGBPM_API_KEY) {
    throw new Error('GETSONGBPM_API_KEY environment variable not set');
  }

  const searchQuery = `${trackName} ${artistName}`;
  const url = `${GETSONGBPM_BASE_URL}/search/?api_key=${GETSONGBPM_API_KEY}&type=song&lookup=${encodeURIComponent(searchQuery)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GetSongBPM API returned ${response.status}`);
    }

    const data = await response.json();
    const results = data.search || [];

    // Find best match by artist name
    const match = results.find((result: GetSongBPMSearchResult) =>
      result.artist.name.toLowerCase().includes(artistName.toLowerCase())
    );

    return match || results[0] || null;
  } catch (error) {
    console.error('GetSongBPM search error:', error);
    return null;
  }
}

async function getSongDetails(songId: string): Promise<GetSongBPMSongData | null> {
  if (!GETSONGBPM_API_KEY) {
    throw new Error('GETSONGBPM_API_KEY environment variable not set');
  }

  const url = `${GETSONGBPM_BASE_URL}/song/?api_key=${GETSONGBPM_API_KEY}&id=${songId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GetSongBPM API returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('GetSongBPM details error:', error);
    return null;
  }
}

const getEnrichedNowPlaying: tool<Record<string, never>> = {
  name: 'getEnrichedNowPlaying',
  description: 'Get currently playing track with enriched metadata (BPM, key, time signature)',
  schema: {},
  handler: async (_args, extra: SpotifyHandlerExtra) => {
    try {
      // First get current track from Spotify
      const { handleSpotifyRequest } = await import('./utils.js');

      const currentTrack = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.player.getCurrentlyPlayingTrack();
      });

      if (!currentTrack?.item || currentTrack.item.type !== 'track') {
        return {
          content: [{
            type: 'text',
            text: 'Nothing is currently playing on Spotify'
          }]
        };
      }

      const item = currentTrack.item as any;
      const trackName = item.name;
      const artistName = item.artists[0]?.name || 'Unknown';
      const albumName = item.album.name;

      // Try to get BPM data from GetSongBPM
      let bpmData = '';

      if (GETSONGBPM_API_KEY) {
        const searchResult = await searchGetSongBPM(trackName, artistName);

        if (searchResult) {
          const details = await getSongDetails(searchResult.song_id);

          if (details?.song) {
            const tempo = details.song.tempo || searchResult.tempo;
            const key = details.song.key_of || searchResult.song_key;
            const timeSig = details.song.time_sig || searchResult.time_sig;

            bpmData = '\n\n**Audio Features:**\n';
            if (tempo) bpmData += `- BPM: ${tempo}\n`;
            if (key) bpmData += `- Key: ${key}\n`;
            if (timeSig) bpmData += `- Time Signature: ${timeSig}\n`;
          }
        }
      }

      const { formatDuration } = await import('./utils.js');
      const duration = formatDuration(item.duration_ms);
      const progress = formatDuration(currentTrack.progress_ms || 0);
      const isPlaying = currentTrack.is_playing;

      return {
        content: [{
          type: 'text',
          text:
            `# Currently ${isPlaying ? 'Playing' : 'Paused'}\n\n` +
            `**Track**: "${trackName}"\n` +
            `**Artist**: ${artistName}\n` +
            `**Album**: ${albumName}\n` +
            `**Progress**: ${progress} / ${duration}\n` +
            `**ID**: ${item.id}` +
            bpmData
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting enriched track info: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
};

export const bpmTools = [getEnrichedNowPlaying];
