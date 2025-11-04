const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jsonToken = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null

const connectDbAndServer = async () => {
  try {
    db = await open({filename: dbpath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000/')
    })
  } catch (e) {
    console.log('connection error : ' + e)
    process.exit(1)
  }
}

connectDbAndServer()

//api 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const checkUser = await db.get(checkUserQuery)
  if (checkUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const createNewUserQuery = `INSERT INTO user (username,password,name, gender)
    VALUES(
      '${username}',
      '${hashedPassword}}',
      '${name}',
      '${gender}'
    );`
    const createNewUser = await db.run(createNewUserQuery)
    const newUserId = createNewUser.lastID
    response.status(200)
    response.send('User created successfully')
  }
})

//api 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUserQueryApi2 = `SELECT * FROM user WHERE username = '${username}';`
  const checkUserApi2 = await db.get(checkUserQueryApi2)
  if (checkUserApi2 === undefined) {
    response.send('Invalid user')
    response.status(400)
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      checkUserApi2.password,
    )
    if (isPasswordCorrect) {
      const payload = {username: username}
      let jwtToken = jsonToken.sign(payload, 'secretKey')
      response.send({jwtToken})
    } else {
      response.status(400).send('Invalid password')
    }
  }
})

const tokenAuthorization = (request, response, next) => {
  let jwt
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwt = authHeader.split(' ')[1]
  }
  if (jwt === undefined) {
    response.send('Invalid JWT Token')
    response.status(401)
  } else {
    jsonToken.verify(jwt, 'secretKey', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//api 3
app.get('/user/tweets/feed/', tokenAuthorization, async (request, response) => {
  const {username} = request
  const api3Query = `SELECT
  "user".username,
  tweet.tweet,
  tweet.date_time AS dateTime
FROM
  follower
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN "user" ON tweet.user_id = "user".user_id
WHERE
  follower.follower_user_id = (SELECT user_id FROM "user" WHERE username = '${username}')
ORDER BY
  tweet.date_time DESC
LIMIT 4;`
  const getApi3 = await db.all(api3Query)
  response.send(getApi3)
})

//api 4
app.get('/user/following/', tokenAuthorization, async (request, response) => {
  const {username} = request
  const api4Query = `SELECT "user".name from "user" 
  INNER JOIN follower on follower.following_user_id = "user".user_id
  WHERE 
    follower.follower_user_id = (
    SELECT user_id FROM "user" WHERE username = '${username}'
  );`
  const api4Response = await db.all(api4Query)
  response.send(api4Response)
})

//api 5
app.get('/user/followers/', tokenAuthorization, async (request, response) => {
  const {username} = request
  const api5Query = `SELECT "user".name from "user" 
  INNER JOIN follower on follower.follower_user_id = "user".user_id
  WHERE 
    follower.following_user_id = (
    SELECT user_id FROM "user" WHERE username = '${username}'
  );`
  const api5Response = await db.all(api5Query)
  response.send(api5Response)
})

//api 6
app.get('/tweets/:tweetId/', tokenAuthorization, async (request, response) => {
  const {username} = request // logged-in user ID from JWT token
  const {tweetId} = request.params // tweetId from URL
  const tweetUserQuery = `
      SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};
    `
  const tweetUser = await db.get(tweetUserQuery)
  if (!tweetUser) {
    response.status(401)
    response.send('Invalid Request')
    return
  }
  const followingQuery = `
      SELECT * FROM follower
      WHERE follower_user_id = (SELECT user_id FROM "user" WHERE username = '${username}')
      AND following_user_id = ${tweetUser.user_id};
    `
  const isFollowing = await db.get(followingQuery)
  if (!isFollowing) {
    response.status(401)
    response.send('Invalid Request')
    return
  }
  const tweetDetailsQuery = `
      SELECT
        tweet.tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
      FROM tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId};
    `
  const tweetDetails = await db.get(tweetDetailsQuery)
  response.send(tweetDetails)
})

//api 7
app.get(
  '/tweets/:tweetId/likes/',
  tokenAuthorization,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const tweetUserQuery = `
      SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};
    `
    const tweetUser = await db.get(tweetUserQuery)
    if (!tweetUser) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    const followingQuery = `
      SELECT * FROM follower
      WHERE follower_user_id = (SELECT user_id FROM "user" WHERE username = '${username}')
      AND following_user_id = ${tweetUser.user_id};
    `
    const isFollowing = await db.get(followingQuery)
    if (!isFollowing) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    const likesQuery = `
      SELECT username
      FROM "user" INNER JOIN like
      ON "user".user_id = like.user_id
      WHERE like.tweet_id = ${tweetId};
    `
    const likedUsers = await db.all(likesQuery)
    const usernamesArray = likedUsers.map(user => user.username)
    response.send({likes: usernamesArray})
  },
)

//api 8
app.get('/tweets/:tweetId/replies/', tokenAuthorization, async (req, res) => {
  try {
    const {username} = req // Logged-in user ID
    const {tweetId} = req.params // Tweet ID from URL

    // Step 1: Find who posted the tweet
    const tweetUserQuery = `
      SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};
    `
    const tweetUser = await db.get(tweetUserQuery)

    // If tweet not found
    if (!tweetUser) {
      res.status(401)
      res.send('Invalid Request')
      return
    }

    // Step 2: Check if logged-in user follows that tweet’s author
    const followingQuery = `
      SELECT * FROM follower
      WHERE follower_user_id = (SELECT user_id FROM "user" WHERE username = '${username}')
      AND following_user_id = ${tweetUser.user_id};
    `
    const isFollowing = await db.get(followingQuery)

    // If not following → Invalid Request
    if (!isFollowing) {
      res.status(401)
      res.send('Invalid Request')
      return
    }

    // Step 3: If following, get all replies for that tweet
    const repliesQuery = `
      SELECT "user".name, reply.reply
      FROM reply
      INNER JOIN "user" ON reply.user_id = "user".user_id
      WHERE reply.tweet_id = ${tweetId};
    `
    const repliesList = await db.all(repliesQuery)

    // Step 4: Send the response in required format
    res.send({replies: repliesList})
  } catch (error) {
    console.log(error.message)
    res.status(500)
    res.send('Server Error')
  }
})

//api 9
app.get('/user/tweets/', tokenAuthorization, async (req, res) => {
  try {
    const {username} = req // Logged-in user's ID from JWT

    // Step 1: Select all tweets posted by the logged-in user
    const userTweetsQuery = `
      SELECT
        tweet.tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
      FROM tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.user_id = (SELECT user_id FROM "user" WHERE username = '${username}')
      GROUP BY tweet.tweet_id;
    `

    // Step 2: Run the query
    const tweetsList = await db.all(userTweetsQuery)

    // Step 3: Send the response
    res.send(tweetsList)
  } catch (error) {
    console.log(error.message)
    res.status(500)
    res.send('Server Error')
  }
})

// api 10
app.post('/user/tweets/', tokenAuthorization, async (req, res) => {
  try {
    const {username} = req // Logged-in user name
    const {tweet} = req.body // Tweet text from request body

    // Step 1: Get current date and time
    const dateTime = new Date().toISOString().replace('T', ' ').split('.')[0]

    // Step 2: Insert tweet into the table
    const createTweetQuery = `
      INSERT INTO tweet (tweet, user_id, date_time)
      VALUES ('${tweet}', (SELECT user_id FROM "user" WHERE username = '${username}'), '${dateTime}');
    `

    await db.run(createTweetQuery)

    // Step 3: Send success response
    res.send('Created a Tweet')
  } catch (error) {
    console.log(error.message)
    res.status(500)
    res.send('Server Error')
  }
})

//api 11
app.delete('/tweets/:tweetId/', tokenAuthorization, async (req, res) => {
  try {
    const {username} = req // Logged-in user ID
    const {tweetId} = req.params // Tweet ID from URL

    // Step 1: Check if tweet belongs to the logged-in user
    const tweetQuery = `
      SELECT * FROM tweet
      WHERE tweet_id = ${tweetId} AND user_id = (SELECT user_id FROM "user" WHERE username = '${username}');
    `
    const userTweet = await db.get(tweetQuery)

    // Step 2: If tweet doesn’t belong to the user → Invalid Request
    if (!userTweet) {
      res.status(401)
      res.send('Invalid Request')
      return
    }

    // Step 3: Delete the tweet from the database
    const deleteQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};
    `
    await db.run(deleteQuery)

    // Step 4: Send success message
    res.send('Tweet Removed')
  } catch (error) {
    console.log(error.message)
    res.status(500)
    res.send('Server Error')
  }
})

module.exports = app
