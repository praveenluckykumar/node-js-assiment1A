const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPtha = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServaer = async () => {
  try {
    db = await open({
      filename: dbPtha,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
initializeDbAndServaer()

const getFollowingPeopleIdsOfUser = async username => {
  const getTheFollowingPeopleQuery = `
    SELECT 
    following_user_id FROM follower
    INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE user.username="${username}";`
  const followingPeople = await db.all(getTheFollowingPeopleQuery)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}

//AUchontoen

const authetication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetAccessVerication = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweetQuery = `SELECT
  
  *
FROM
 tweet INNER JION follower ON tweet.user_id =follower .following_user_id 

 WHERE 
tweet.tweet_id = "${tweetId} " AND following_user_id="${userId}";`

  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username="${username}";`
  const userDBDetails = await db.get(getUserQuery)

  if (userDBDetails !== undefined) {
    response.status(400)

    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)

      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createuserQuery = `
      INSERT INTO user(username,password,name,gender)
      VALUES ("${username}","${hashedPassword}","${name}", "${gender}" );`
      await db.run(createuserQuery)
      response.send('User created successfully')
    }
  }
})

//api 2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `
  SELECT * FROM user WHERE username="${username}";`
  const userDBDetails = await db.get(getUserQuery)

  if (userDBDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDBDetails.password,
    )
    if (isPasswordCorrect) {
      const payload = {username, userId: userDBDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')

      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//APi 3

app.get('/user/tweets/feed/', authetication, async (request, response) => {
  const {username} = request

  const followingpeopleIds = await getFollowingPeopleIdsOfUser(username)

  const getTweetsQuery = `SELECT
   username,tweet, date_time as dateTime

  FROM user INNER JOIN tweet ON user.user_id=tweet.user_id

  WHERE 

  user.user_id IN (${followingpeopleIds})

  ORDER BY date_time DESC 

  LIMIT 4
  ;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//api 4
app.get('/user/following/', authetication, async (request, response) => {
  const {username, userId} = request
  const getFollowinguserQuery = `SELECT
name FROM follower 
INNER JOIN user ON user.user_id=follower.following_user_id

WHERE following_user_id="${userId}";`

  const followingPeople = await db.all(getFollowinguserQuery)
  response.send(followingPeople)
})

//api 5
app.get('/user/followers/', authetication, async (request, response) => {
  const {username, userId} = request

  const getFollowinguserQuery = `
  SELECT DISTINCT name FROM follower 
  INNER JOIN user ON user.user_id=follower.following_user_id
  WHERE following_user_id="${userId}";
  `
  const followers = await db.all(getFollowinguserQuery)
  response.send(followers)
})

//api-6
app.get(
  '/tweets/:tweetId/',
  authetication,
  tweetAccessVerication,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `
    SELECT tweet ,
    (SELECT COUNT() FROM Like WHERE tweet_id="${tweetId}") As likes,
    (SELECT COUNT() FROM reply WHERE tweet_id="${tweetId}") As replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id="${tweetId}"
    ;`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

//api-7
app.get(
  '/tweets/:tweetId/likes/',
  authetication,
  tweetAccessVerication,
  async (request, response) => {
    const {tweetId} = request.params
    const getlikesQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id
    WHERE  tweet_id="${tweetId}"
    `
    const likedUsers = await db.all(getlikesQuery)
    const userArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: userArray})
  },
)
//api 8

app.get(
  '/tweets/:tweetId/replies/',
  authetication,
  tweetAccessVerication,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepideQuery = `
    SELECT name ,reply
    FROM user INNER JOIN reply ON user.user_id=reply.user_id
    WHERE tweet_id ="${tweetId}";`
    const repliedUsers = await db.all(getRepideQuery)
    response.send({replies: repliedUsers})
  },
)
//api9

app.get('/user/tweets/', authetication, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `
  SELECT tweet,
  COUNT(DISTINCT like_id) as likes,
  COUNT(DISTINCT reply_id) as replies,
  date_time as DATETIME 

  FROM tweet LEFT JOIN reply ON tweet.tweet_id =reply.tweet_id LEFT JOIN like ON tweet.tweet_id=like.tweet_id 
WHERE tweet.user_id ${userId}

GROUP BY tweet.tweet_id;`
  const tweet = await db.all(getTweetQuery)
  response.send(tweet)
})

//api 10

app.post('/user/tweets/', authetication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `
  INSERT INTO tweet(tweet,user_id,date_time)
  VALUES ("${tweet}","${userId}","${dateTime}")
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})
//api 11

app.delete('/tweets/:tweetId/', authetication, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const getaTheTweetQuery = `
  SELECT * FROM tweet WHERE user_id ="${userId}" AND tweet_id  ="${tweetId}";`

  const tweet = await db.get(getaTheTweetQuery)
  console.log(tweet)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweetQuery = `
    DELETE FROM tweet WHERE tweet_id="${tweetId}";`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
