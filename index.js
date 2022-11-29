const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
require('dotenv').config();

const port = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.7f5wlkw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}

const run = async () => {
    try {
        const categoryCollection = client.db('bookResale').collection('category');
        const bookCollection = client.db('bookResale').collection('books');
        const userCollection = client.db('bookResale').collection('users');
        const orderCollection = client.db('bookResale').collection('orders');
        const blogCollection = client.db('bookResale').collection('blogs');

        const verifyAdminSeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userCollection.findOne(query);

            if (user?.role === 'seller') {
                next();
            }
            else if (user?.role === 'admin') {
                next();
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        }

        const verifyOnlyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        })

        app.get('/category', async (req, res) => {
            const query = {};
            const result = await categoryCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/category', async (req, res) => {
            const categoryData = req.body;
            const c_data = categoryData.categoryName.toLowerCase();

            const query = {
                categoryName: c_data
            }

            const bool = await categoryCollection.find(query).toArray();

            if (bool.length) {
                const message = "you cannot insert same data";
                return res.send({ acknowledged: false, message })
            }

            const result = await categoryCollection.insertOne(query);
            res.send(result);
        });

        app.get('/books', async (req, res) => {
            const options = await bookCollection.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'email',
                        foreignField: 'email',
                        as: 'userField'
                    }
                }
            ]).toArray();

            const filteredData = options.filter(option => option.category.includes(req.query.category));
            let finalResponse = filteredData;
            if (!req.query.category) {
                finalResponse = options;
            }

            res.send(finalResponse);
        });

        app.post('/books', verifyJWT, verifyAdminSeller, async (req, res) => {
            const bookData = req.body;
            const result = await bookCollection.insertOne(bookData);
            res.send(result);
        });

        app.get('/users', async (req, res) => {

            let query = {};
            if (req.query.email) {
                query = {
                    email: req.query.email
                }
            }

            const result = await userCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ isSeller: user?.role === 'seller' ? true : user?.role === 'admin' })
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' })
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const userEmail = user.email;

            const query = {
                email: userEmail
            }

            const bool = await userCollection.find(query).toArray();

            if (bool.length) {
                const message = "you cannot insert same data";
                return res.send({ acknowledged: false, message })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.get('/orders', async (req, res) => {

            let query = {};
            if (req.query.email) {
                query = {
                    email: req.query.email
                }
            }

            const result = await orderCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/orders', async (req, res) => {
            const orderData = req.body;
            const result = await orderCollection.insertOne(orderData);
            res.send(result);
        });


        app.get('/ownproduct/:email', verifyJWT, verifyAdminSeller, async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await bookCollection.find(query).toArray();
            res.send(user);
        });

        app.get('/mybuyers/:email', verifyJWT, verifyAdminSeller, async (req, res) => {
            const email = req.params.email;
            const query = { sellerEmail: email };
            const user = await orderCollection.find(query).toArray();
            res.send(user);
        });

        app.get('/rolebaseduser/:role', verifyJWT, verifyOnlyAdmin, async (req, res) => {
            const role = req.params.role;
            const query = { role: role };
            const user = await userCollection.find(query).toArray();
            res.send(user);
        });

        app.put('/updateadvertise/:id', verifyJWT, verifyAdminSeller, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    advertised: true
                }
            }
            const result = await bookCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.put('/reverseadvertise/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    advertised: false
                }
            }
            const result = await bookCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.put('/verifyuser/:id', verifyJWT, verifyOnlyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    isVerified: true
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.delete('/bookdelete/:id', verifyJWT, verifyAdminSeller, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await bookCollection.deleteOne(filter);
            res.send(result);
        });

        // app.post('/blog', async (req, res) => {
        //     const blog = req.body;
        //     const result = await blogCollection.insertOne(blog);
        //     res.send(result);
        // });

        app.get('/blog', async (req, res) => {
            const query = {};
            const cursor = blogCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/advertisedproduct', async (req, res) => {
            const options = await bookCollection.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'email',
                        foreignField: 'email',
                        as: 'userField'
                    }
                }
            ]).toArray();

            const filteredData = options.filter(option => option.advertised);
            res.send(filteredData);
        });

        // For Payment

        app.get('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.findOne(query);
            res.send(result);

        });

        app.post('/paymentintentstripe', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.put('/paymentstatus/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    paid: true
                }
            }
            const result = await orderCollection.updateOne(filter, updateDoc, options);
            // const result2 = await bookCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })


        // app.get('/test', async (req, res) => {



        // });

    }
    finally {

    }
}

run().catch(err => console.log(err));

app.get("/", async (req, res) => {
    res.send(`Book Resale Server Running on Now PORT ${port}`);
})

app.listen(port, () => console.log(`Book Resale Server Running on PORT ${port}`));