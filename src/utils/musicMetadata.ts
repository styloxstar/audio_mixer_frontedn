import jsmediatags from 'jsmediatags';

export interface SongMetadata {
  title: string;
  artist: string;
  album: string;
  pictureUrl: string | null;
}

export function parseAudioMetadata(file: File): Promise<SongMetadata> {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: function(tag) {
        let pictureUrl = null;
        if (tag.tags.picture) {
          const { data, format } = tag.tags.picture;
          let base64String = '';
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          pictureUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }
        
        resolve({
          title: tag.tags.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: tag.tags.artist || 'Unknown Artist',
          album: tag.tags.album || 'Unknown Album',
          pictureUrl
        });
      },
      onError: function(error) {
        console.warn('Error reading ID3 tags', error);
        resolve({
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          pictureUrl: null
        });
      }
    });
  });
}
