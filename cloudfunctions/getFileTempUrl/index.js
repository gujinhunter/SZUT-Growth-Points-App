const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event) => {
  const { fileIDs } = event || {};
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    return {
      code: 'INVALID_PARAMS',
      message: 'fileIDs 不能为空',
      data: []
    };
  }

  try {
    const res = await cloud.getTempFileURL({
      fileList: fileIDs
    });

    return {
      code: 'SUCCESS',
      data: res.fileList || []
    };
  } catch (err) {
    console.error('getTempFileUrl error', err);
    return {
      code: 'ERROR',
      message: err.message || '获取临时链接失败'
    };
  }
};

