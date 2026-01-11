import type { MaxInt } from '@spotify/web-api-ts-sdk';
import { z } from 'zod';
import type { SpotifyHandlerExtra, SpotifyTrack, tool } from './types.js';
import { formatDuration, handleSpotifyRequest } from './utils.js';

function isTrack(item: any): item is SpotifyTrack {
  return item && item.type === 'track' && Array.isArray(item.artists) && item.album;
}

const operationEnum = z.enum([
  'search',
  'playlists',
  'playlist_tracks',
  'saved_tracks',
  'recently_played',
  'albums',
  'album_tracks',
  'save_album',
  'remove_album',
  'check_saved',
]);

export const spotifyLibrary: tool<{
  operation: typeof operationEnum;
  query: z.ZodOptional<z.ZodString>;
  type: z.ZodOptional<z.ZodEnum<['track', 'album', 'artist', 'playlist']>>;
  playlist_id: z.ZodOptional<z.ZodString>;
  album_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
  limit: z.ZodOptional<z.ZodNumber>;
  offset: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'spotify_library',
  description: 'Search and browse Spotify library, playlists, albums, and saved tracks',
  schema: {
    operation: operationEnum.describe(
      'Operation: search, playlists, playlist_tracks, saved_tracks, recently_played, albums, album_tracks, save_album, remove_album, check_saved'
    ),
    query: z.string().optional().describe('Search query'),
    type: z.enum(['track', 'album', 'artist', 'playlist']).optional().describe('Search type'),
    playlist_id: z.string().optional().describe('Playlist ID'),
    album_ids: z.array(z.string()).optional().describe('Album IDs (max 20)'),
    limit: z.number().min(1).max(50).optional().describe('Result limit (1-50)'),
    offset: z.number().min(0).optional().describe('Pagination offset'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { operation, query, type, playlist_id, album_ids, limit = 20, offset = 0 } = args;

    switch (operation) {
      case 'search': {
        if (!query || !type) {
          return { content: [{ type: 'text', text: 'Error: query and type required' }] };
        }
        const results = await handleSpotifyRequest(async (api) => {
          return await api.search(query, [type], undefined, limit as MaxInt<50>);
        });

        let text = '';
        if (type === 'track' && results.tracks) {
          text = results.tracks.items.map((t, i) =>
            `${i+1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')} - ID: ${t.id}`
          ).join('\n');
        } else if (type === 'album' && results.albums) {
          text = results.albums.items.map((a, i) =>
            `${i+1}. "${a.name}" by ${a.artists.map(x => x.name).join(', ')} - ID: ${a.id}`
          ).join('\n');
        } else if (type === 'artist' && results.artists) {
          text = results.artists.items.map((a, i) => `${i+1}. ${a.name} - ID: ${a.id}`).join('\n');
        } else if (type === 'playlist' && results.playlists) {
          text = results.playlists.items.map((p, i) =>
            `${i+1}. "${p?.name}" by ${p?.owner?.display_name} - ID: ${p?.id}`
          ).join('\n');
        }
        return { content: [{ type: 'text', text: text || 'No results' }] };
      }

      case 'playlists': {
        const playlists = await handleSpotifyRequest(async (api) => {
          return await api.currentUser.playlists.playlists(limit as MaxInt<50>);
        });
        const text = playlists.items.map((p, i) =>
          `${i+1}. "${p.name}" (${p.tracks?.total || 0} tracks) - ID: ${p.id}`
        ).join('\n');
        return { content: [{ type: 'text', text: text || 'No playlists' }] };
      }

      case 'playlist_tracks': {
        if (!playlist_id) {
          return { content: [{ type: 'text', text: 'Error: playlist_id required' }] };
        }
        const tracks = await handleSpotifyRequest(async (api) => {
          return await api.playlists.getPlaylistItems(playlist_id, undefined, undefined, limit as MaxInt<50>, offset);
        });
        const text = tracks.items.map((item, i) => {
          const t = item.track;
          if (!t || !isTrack(t)) return `${offset+i+1}. [Unknown]`;
          return `${offset+i+1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')} - ID: ${t.id}`;
        }).join('\n');
        return { content: [{ type: 'text', text: `Tracks ${offset+1}-${offset+tracks.items.length} of ${tracks.total}\n\n${text}` }] };
      }

      case 'saved_tracks': {
        const saved = await handleSpotifyRequest(async (api) => {
          return await api.currentUser.tracks.savedTracks(limit as MaxInt<50>, offset);
        });
        const text = saved.items.map((item, i) => {
          const t = item.track;
          if (!t || !isTrack(t)) return `${offset+i+1}. [Unknown]`;
          return `${offset+i+1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')} - ID: ${t.id}`;
        }).join('\n');
        return { content: [{ type: 'text', text: `Liked Songs ${offset+1}-${offset+saved.items.length} of ${saved.total}\n\n${text}` }] };
      }

      case 'recently_played': {
        const history = await handleSpotifyRequest(async (api) => {
          return await api.player.getRecentlyPlayedTracks(limit as MaxInt<50>);
        });
        const text = history.items.map((item, i) => {
          const t = item.track;
          if (!isTrack(t)) return `${i+1}. [Unknown]`;
          return `${i+1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')} - ID: ${t.id}`;
        }).join('\n');
        return { content: [{ type: 'text', text: text || 'No history' }] };
      }

      case 'albums': {
        if (!album_ids?.length) {
          return { content: [{ type: 'text', text: 'Error: album_ids required' }] };
        }
        const albums = await handleSpotifyRequest(async (api) => {
          return await api.albums.get(album_ids.slice(0, 20));
        });
        const text = albums.map((a, i) =>
          `${i+1}. "${a.name}" by ${a.artists.map(x => x.name).join(', ')} (${a.total_tracks} tracks) - ID: ${a.id}`
        ).join('\n');
        return { content: [{ type: 'text', text }] };
      }

      case 'album_tracks': {
        if (!album_ids?.[0]) {
          return { content: [{ type: 'text', text: 'Error: album_ids[0] required' }] };
        }
        const tracks = await handleSpotifyRequest(async (api) => {
          return await api.albums.tracks(album_ids[0], undefined, limit as MaxInt<50>, offset);
        });
        const text = tracks.items.map((t, i) =>
          `${offset+i+1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')} (${formatDuration(t.duration_ms)}) - ID: ${t.id}`
        ).join('\n');
        return { content: [{ type: 'text', text }] };
      }

      case 'save_album': {
        if (!album_ids?.length) {
          return { content: [{ type: 'text', text: 'Error: album_ids required' }] };
        }
        await handleSpotifyRequest(async (api) => {
          await api.currentUser.albums.saveAlbums(album_ids.slice(0, 20));
        });
        return { content: [{ type: 'text', text: `Saved ${album_ids.length} album(s)` }] };
      }

      case 'remove_album': {
        if (!album_ids?.length) {
          return { content: [{ type: 'text', text: 'Error: album_ids required' }] };
        }
        await handleSpotifyRequest(async (api) => {
          await api.currentUser.albums.removeSavedAlbums(album_ids.slice(0, 20));
        });
        return { content: [{ type: 'text', text: `Removed ${album_ids.length} album(s)` }] };
      }

      case 'check_saved': {
        if (!album_ids?.length) {
          return { content: [{ type: 'text', text: 'Error: album_ids required' }] };
        }
        const saved = await handleSpotifyRequest(async (api) => {
          return await api.currentUser.albums.hasSavedAlbums(album_ids.slice(0, 20));
        });
        const text = album_ids.map((id, i) => `${id}: ${saved[i] ? 'saved' : 'not saved'}`).join('\n');
        return { content: [{ type: 'text', text }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown operation: ${operation}` }] };
    }
  },
};
