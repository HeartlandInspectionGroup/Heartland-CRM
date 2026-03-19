const { corsHeaders } = require('./lib/cors');
exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      cloudinaryCloudName:   process.env.CLOUDINARY_CLOUD_NAME    || '',
      cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    }),
  };
};
