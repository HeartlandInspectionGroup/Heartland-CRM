const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      cloudinaryCloudName:   process.env.CLOUDINARY_CLOUD_NAME    || '',
      cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    }),
  };
};
