const express = require('express');
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
    })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gkz5fmx.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const classesCollection = client.db('languageClubDB').collection('classes')
        const instructorsCollection = client.db('languageClubDB').collection('instructors')
        const usersCollection = client.db('languageClubDB').collection('users')
        const selectedClassesCollection = client.db('languageClubDB').collection('selectedClasses')
        const paymentCollection = client.db('languageClubDB').collection('payments')

        // jwt apis
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


        app.get('/popularClasses', async (req, res) => {
            const result = await classesCollection.find().limit(6).sort({ students: -1 }).toArray()
            res.send(result)
        })

        app.get('/popularInstructors', async (req, res) => {
            const result = await instructorsCollection.find().limit(6).sort({ students: -1 }).toArray()
            res.send(result)
        })

        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' }
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        // classes apis
        app.get('/classes', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/adminClasses', async (req, res) => {
            const result = await classesCollection.find().toArray()
            res.send(result)
        })

        app.patch('/approveClass/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: 'approved'
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.patch('/denyClass/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: 'denied'
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.put('/sendFeedback/:id', async (req, res) => {
            const id = req.params.id
            const { feedback } = req.body
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    feedback: feedback
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        app.post('/addAClass', async (req, res) => {
            const classInfo = req.body
            classInfo.price = parseFloat(classInfo.price)
            classInfo.availableSeats = parseInt(classInfo.availableSeats)
            const result = await classesCollection.insertOne(classInfo)
            res.send(result)
        })

        app.get('/instructorClasses/:email', async (req, res) => {
            const email = req.params.email
            const query = { instructorEmail: email }
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/getAClassToUpdate/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await classesCollection.findOne(query)
            res.send(result)
        })

        app.put('/updateAClass/:id', async (req, res) => {
            const id = req.params.id
            const updateClassInfo = req.body
            const filter = { _id: new ObjectId(id)}
            const options = { upsert: true };
            
            const updateDoc = {
                $set: {
                    name: updateClassInfo.name,
                    image: updateClassInfo.image,
                    instructorName: updateClassInfo.instructorName,
                    instructorEmail: updateClassInfo.instructorEmail,
                    availableSeats: updateClassInfo.availableSeats,
                    price: updateClassInfo.price,
                    status: updateClassInfo.status,
                    students: updateClassInfo.students,
                    feedback: updateClassInfo?.feedback
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // classes apis end

        // users apis

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { admin: user.role === 'admin' }
            res.send(result)
        })

        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ student: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { student: user.role === 'student' }
            res.send(result)
        })

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { instructor: user.role === 'instructor' }
            res.send(result)
        })

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id

            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                }
            }

            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id

            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }

            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        // user apis end

        app.get('/selectedClasses/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await selectedClassesCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'User already exist' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.post('/selectedClasses/:id', async (req, res) => {
            const selectedClass = req.body;
            // selectedClass.availableSeats = parseInt(availableSeats) - 1

            const id = req.params.id;
            // console.log(id)

            const query = { selectedClassId: id, email: selectedClass.email }

            const existingClass = await selectedClassesCollection.findOne(query)

            if (existingClass) {
                return res.send({ message: 'You already added this class' });
            }

            const result = await selectedClassesCollection.insertOne(selectedClass)
            res.send(result)
        })

        app.patch('/selectedClasses/:id', async (req, res) => {
            const id = req.params.id
            const selectedClass = req.body
            // console.log(id)
            // console.log(selectedClass)

            const filter = { _id: new ObjectId(id) }

            const updateDoc = {
                $set: {
                    availableSeats: parseInt(selectedClass.availableSeats) - 1
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.patch('/updateStudentsCount/:id', async (req, res) => {
            const id = req.params.id
            const selectedClass = req.body
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    students: parseInt(selectedClass.students) + 1
                }
            }

            const result = await classesCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.delete('/deleteSelectedClasses/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassesCollection.deleteOne(query)
            res.send(result)
        })

        // stripe apis
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body
            const amount = price * 100
            // const amountInt = parseInt(amount)
            // console.log(amountInt)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: parseInt(amount),
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment apis

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment)

            const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }

            const deleteResult = selectedClassesCollection.deleteMany(query)

            res.send({ insertResult, deleteResult })
        })

        app.get('/payments/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray()
            res.send(result)
        })

        // payment history related apis

        app.get('/enrolledClasses/:email', async (req, res) => {
            const email = req.params.email
            const payments = await paymentCollection.find({ email: email }).toArray()

            const selectedClassesId = payments.flatMap(payment => payment.selectedClassesId)

            const classes = await classesCollection.aggregate([
                {
                    $match: {
                        _id: { $in: selectedClassesId.map(id => new ObjectId(id)) }
                    }
                }
            ]).toArray()
            res.send(classes)
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Language Club server is running')
})

app.listen(port, () => {
    console.log(`Server is running  on port: ${port}`)
})