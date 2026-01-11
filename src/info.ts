import { z } from 'zod';
import type { SpotifyHandlerExtra, SpotifyTrack, tool } from './types.js';
import { formatDuration, handleSpotifyRequest } from './utils.js';

function isTrack(item: any): item is SpotifyTrack {
  return item && item.type === 'track' && Array.isArray(item.artists) && item.album;
}

const operationEnum = z.enum(['now_playing', 'enriched_now_playing', 'queue', 'audio_features']);

export const spotifyInfo: tool<{
  operation: typeof operationEnum;
  track_id: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'spotify_info',
  description: 'Get current playback info, queue, and audio features',
  schema: {
    operation: operationEnum.describe('Operation: now_playing, enriched_now_playing, queue, audio_features'),
    track_id: z.string().optional().describe('Track ID (for audio_features)'),
    limit: z.number().min(1).max(50).optional().describe('Queue limit'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { operation, track_id, limit = 10 } = args;

    switch (operation) {
      case 'now_playing': {
        const current = await handleSpotifyRequest(async (api) => {
          return await api.player.getCurrentlyPlayingTrack();
        });

        if (!current?.item || !isTrack(current.item)) {
          return { content: [{ type: 'text', text: 'Nothing playing' }] };
        }

        const t = current.item;
        const text = [
          `**Track**: "${t.name}"`,
          `**Artist**: ${t.artists.map(a => a.name).join(', ')}`,
          `**Album**: ${t.album.name}`,
          `**Progress**: ${formatDuration(current.progress_ms || 0)} / ${formatDuration(t.duration_ms)}`,
          `**Status**: ${current.is_playing ? 'Playing' : 'Paused'}`,
          `**ID**: ${t.id}`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      }

      case 'enriched_now_playing': {
        const current = await handleSpotifyRequest(async (api) => {
          return await api.player.getCurrentlyPlayingTrack();
        });

        if (!current?.item || !isTrack(current.item)) {
          return { content: [{ type: 'text', text: 'Nothing playing' }] };
        }

        const t = current.item;
        const artistName = t.artists[0]?.name || '';

        // Get audio features
        const features = await handleSpotifyRequest(async (api) => {
          return await api.tracks.audioFeatures(t.id);
        });

        const bpm = features?.tempo ? Math.round(features.tempo) : null;

        const keyNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        const key = features?.key !== undefined && features.key !== -1 ? keyNames[features.key] : null;
        const mode = features?.mode === 1 ? 'Major' : features?.mode === 0 ? 'Minor' : null;

        const lines = [
          `**Track**: "${t.name}"`,
          `**Artist**: ${t.artists.map(a => a.name).join(', ')}`,
          `**Album**: ${t.album.name}`,
          `**Progress**: ${formatDuration(current.progress_ms || 0)} / ${formatDuration(t.duration_ms)}`,
        ];
        if (bpm) lines.push(`**BPM**: ${bpm}`);
        if (key && mode) lines.push(`**Key**: ${key} ${mode}`);
        if (features) {
          lines.push(`**Energy**: ${(features.energy * 100).toFixed(0)}%`);
          lines.push(`**Danceability**: ${(features.danceability * 100).toFixed(0)}%`);
        }
        lines.push(`**ID**: ${t.id}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'queue': {
        const queue = await handleSpotifyRequest(async (api) => {
          return await api.player.getUsersQueue();
        });

        const current = (queue as any)?.currently_playing;
        const upcoming = ((queue as any)?.queue ?? []).slice(0, limit) as any[];

        let text = '# Queue\n\n';
        if (current) {
          text += `Now: "${current.name}" by ${current.artists?.map((a: any) => a.name).join(', ') || 'Unknown'}\n\n`;
        }
        if (upcoming.length) {
          text += 'Up next:\n' + upcoming.map((t, i) =>
            `${i+1}. "${t.name}" by ${t.artists?.map((a: any) => a.name).join(', ') || 'Unknown'} - ID: ${t.id}`
          ).join('\n');
        } else {
          text += 'Queue empty';
        }
        return { content: [{ type: 'text', text }] };
      }

      case 'audio_features': {
        if (!track_id) {
          return { content: [{ type: 'text', text: 'Error: track_id required' }] };
        }
        const features = await handleSpotifyRequest(async (api) => {
          return await api.tracks.audioFeatures(track_id);
        });

        if (!features) {
          return { content: [{ type: 'text', text: 'No features found' }] };
        }

        const keyNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        const key = features.key !== -1 ? keyNames[features.key] : 'Unknown';
        const mode = features.mode === 1 ? 'Major' : 'Minor';

        const text = [
          `**BPM**: ${Math.round(features.tempo)}`,
          `**Key**: ${key} ${mode}`,
          `**Energy**: ${(features.energy * 100).toFixed(0)}%`,
          `**Danceability**: ${(features.danceability * 100).toFixed(0)}%`,
          `**Valence**: ${(features.valence * 100).toFixed(0)}%`,
          `**Acousticness**: ${(features.acousticness * 100).toFixed(0)}%`,
          `**Instrumentalness**: ${(features.instrumentalness * 100).toFixed(0)}%`,
          `**Loudness**: ${features.loudness.toFixed(1)} dB`,
          `**Time Sig**: ${features.time_signature}/4`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown operation: ${operation}` }] };
    }
  },
};
