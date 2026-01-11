import { z } from 'zod';
import type { SpotifyHandlerExtra, tool } from './types.js';
import { handleSpotifyRequest } from './utils.js';

const operationEnum = z.enum([
  'play',
  'pause',
  'resume',
  'skip_next',
  'skip_prev',
  'queue',
  'create_playlist',
  'add_to_playlist',
]);

export const spotifyPlayback: tool<{
  operation: typeof operationEnum;
  uri: z.ZodOptional<z.ZodString>;
  type: z.ZodOptional<z.ZodEnum<['track', 'album', 'artist', 'playlist']>>;
  id: z.ZodOptional<z.ZodString>;
  device_id: z.ZodOptional<z.ZodString>;
  name: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  public: z.ZodOptional<z.ZodBoolean>;
  playlist_id: z.ZodOptional<z.ZodString>;
  track_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
  position: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'spotify_playback',
  description: 'Control Spotify playback and manage playlists',
  schema: {
    operation: operationEnum.describe(
      'Operation: play, pause, resume, skip_next, skip_prev, queue, create_playlist, add_to_playlist'
    ),
    uri: z.string().optional().describe('Spotify URI (overrides type+id)'),
    type: z.enum(['track', 'album', 'artist', 'playlist']).optional().describe('Item type'),
    id: z.string().optional().describe('Spotify ID'),
    device_id: z.string().optional().describe('Target device ID'),
    name: z.string().optional().describe('Playlist name (for create_playlist)'),
    description: z.string().optional().describe('Playlist description'),
    public: z.boolean().optional().describe('Make playlist public'),
    playlist_id: z.string().optional().describe('Target playlist ID'),
    track_ids: z.array(z.string()).optional().describe('Track IDs to add'),
    position: z.number().nonnegative().optional().describe('Insert position'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { operation, uri, type, id, device_id, name, description, public: isPublic, playlist_id, track_ids, position } = args;

    switch (operation) {
      case 'play': {
        if (!(uri || (type && id))) {
          return { content: [{ type: 'text', text: 'Error: Provide uri OR type+id' }] };
        }
        let spotifyUri = uri || `spotify:${type}:${id}`;
        await handleSpotifyRequest(async (api) => {
          if (type === 'track') {
            await api.player.startResumePlayback(device_id || '', undefined, [spotifyUri]);
          } else {
            await api.player.startResumePlayback(device_id || '', spotifyUri);
          }
        });
        return { content: [{ type: 'text', text: `Playing ${type || 'music'}` }] };
      }

      case 'pause': {
        await handleSpotifyRequest(async (api) => {
          await api.player.pausePlayback(device_id || '');
        });
        return { content: [{ type: 'text', text: 'Paused' }] };
      }

      case 'resume': {
        await handleSpotifyRequest(async (api) => {
          await api.player.startResumePlayback(device_id || '');
        });
        return { content: [{ type: 'text', text: 'Resumed' }] };
      }

      case 'skip_next': {
        await handleSpotifyRequest(async (api) => {
          await api.player.skipToNext(device_id || '');
        });
        return { content: [{ type: 'text', text: 'Skipped to next' }] };
      }

      case 'skip_prev': {
        await handleSpotifyRequest(async (api) => {
          await api.player.skipToPrevious(device_id || '');
        });
        return { content: [{ type: 'text', text: 'Skipped to previous' }] };
      }

      case 'queue': {
        if (!(uri || (type && id))) {
          return { content: [{ type: 'text', text: 'Error: Provide uri OR type+id' }] };
        }
        const spotifyUri = uri || `spotify:${type}:${id}`;
        await handleSpotifyRequest(async (api) => {
          await api.player.addItemToPlaybackQueue(spotifyUri, device_id || '');
        });
        return { content: [{ type: 'text', text: `Added to queue: ${spotifyUri}` }] };
      }

      case 'create_playlist': {
        if (!name) {
          return { content: [{ type: 'text', text: 'Error: name required' }] };
        }
        const result = await handleSpotifyRequest(async (api) => {
          const me = await api.currentUser.profile();
          return await api.playlists.createPlaylist(me.id, {
            name,
            description,
            public: isPublic ?? false,
          });
        });
        return { content: [{ type: 'text', text: `Created playlist "${name}" (ID: ${result.id})` }] };
      }

      case 'add_to_playlist': {
        if (!playlist_id || !track_ids?.length) {
          return { content: [{ type: 'text', text: 'Error: playlist_id and track_ids required' }] };
        }
        const trackUris = track_ids.map((id) => `spotify:track:${id}`);
        await handleSpotifyRequest(async (api) => {
          await api.playlists.addItemsToPlaylist(playlist_id, trackUris, position);
        });
        return { content: [{ type: 'text', text: `Added ${track_ids.length} tracks to playlist` }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown operation: ${operation}` }] };
    }
  },
};
