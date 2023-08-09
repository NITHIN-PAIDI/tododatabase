const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};
initializeDBAndServer();

//jwt token verifiation

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//register user api-1
app.post("/register", async (request, response) => {
  const { username, name, password, gender } = request.body;
  //const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;

  console.log(username, password, password, gender);
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//user Login api 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//user tweet feed

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsFeedQuery = `
        SELECT username,tweet,date_time AS dateTime
        FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}
        ORDER BY
            date_time DESC
        LIMIT 4;
    `;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//get user Following user Api 4

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowsQuery = `
        SELECT name
        FROM user INNER JOIN follower on user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${user_id};
    `;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

//Api 5
app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowsQuery = `
        SELECT name
        FROM user INNER JOIN follower on user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = ${user_id};
    `;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

//APi 6 get tweet
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsQuery = `SELECT * FROM Tweet WHERE tweet_id = ${tweetId}`;
  const tweetResult = await db.get(tweetsQuery);
  const userFollowersQuery = `
        SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id

        WHERE follower.follower_user_id = ${user_id} ;
    `;

  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    console.log(tweetResult);
    console.log("_ _ _ _ _ _ _ ");
    console.log(userFollowers);

    const getTweetDetailsQuery = `
        SELECT 
            tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
             COUNT(DISTINCT(reply.reply_id)) AS replies,
             tweet.date_time AS dateTime
        FROM 
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE 
            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};


        `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//APi7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const getLikedUsersQuery = `
        SELECT *
        FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN  like ON like.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = like.user_id
        where tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;
    const likedUsers = await db.all(getLikedUsersQuery);
    console.log(likedUsers);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("invalid request");
    }
  }
);

//Api 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const getRepliedUsersQuery = `
         SELECT *
        FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN  reply ON reply.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = like.user_id
        WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;
    const repliedUsers = await db.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//APi 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const getTweetDetailsQuery = `
        SELECT
            tweet.tweet AS tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM  user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE user.user_id = ${user_id}
        GROUP BY tweet.tweet_id ;
    `;
  const tweetDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetDetails);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const postTweetQuery = `
        INSERT INTO 
            tweet(tweet,user_id)
        VALUES (
            '${tweet}',
            ${user_id}
        )
  ;`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
    const tweetUser = await db.all(selectUserQuery);
    if (tweetUser.length !== 0) {
      const deleteQuery = `
            DELETE FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};
        `;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
//exporting the  module
module.exports = app;
