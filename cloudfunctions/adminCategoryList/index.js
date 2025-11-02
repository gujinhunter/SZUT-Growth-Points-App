const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async () => {
  const res = await db.collection('projects').aggregate()
    .match({
      category: _.and(_.neq(null), _.neq(''))
    })
    .group({
      _id: '$category'
    })
    .project({
      _id: 0,
      category: '$_id'
    })
    .end();
  return (res.list || []).map(item => item.category);
};