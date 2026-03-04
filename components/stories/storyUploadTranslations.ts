export function getStoryUploadTranslations(language: string) {
  if (language === 'es') {
    return {
      addStory: 'Agregar Historia',
      takePhoto: 'Foto o C\u00e1mara',
      chooseVideo: 'Elegir Video',
      caption: 'Escribe un pie de foto...',
      post: 'Publicar Historia',
      posting: 'Publicando...',
      success: '\u00a1Historia publicada!',
      errorUpload: 'Error al subir la historia',
      fileTooLarge: 'Archivo muy grande. M\u00e1ximo 10MB para fotos, 50MB para videos.',
      videoTooLong: 'Video muy largo. M\u00e1ximo 60 segundos.',
      uploadTimeout: 'La subida tard\u00f3 demasiado. Intenta con un archivo m\u00e1s peque\u00f1o.',
    };
  }
  return {
    addStory: 'Add Story',
    takePhoto: 'Photo or Camera',
    chooseVideo: 'Choose Video',
    caption: 'Write a caption...',
    post: 'Post Story',
    posting: 'Posting...',
    success: 'Story posted!',
    errorUpload: 'Failed to upload story',
    fileTooLarge: 'File too large. Max 10MB for photos, 50MB for videos.',
    videoTooLong: 'Video too long. Maximum 60 seconds.',
    uploadTimeout: 'Upload took too long. Try a smaller file.',
  };
}
