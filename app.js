require('dotenv').config()
const fs = require('fs')
const express = require('express')
const multer = require('multer')
const bcrypt = require('bcryptjs')
const path = require('path')
const db = require('./database')
const { nanoid } = require('nanoid');


const app = express()
const PORT = process.env.PORT || 3000

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

if (!fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
    // Create uploads if not exist
    fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
    console.log('Directory created:', path.join(__dirname, 'public', 'uploads'));
} else {
    console.log('Directory already exists:', path.join(__dirname, 'public', 'uploads'));
}

// Middleware to check device
function checkDevice(uaFilter) {
    return (req, res, next) => {
        const userAgent = req.headers['user-agent'].toLowerCase()
        const filters = uaFilter.split(',')
        for (let filter of filters) {
            if (userAgent.includes(filter.split('|')[0].trim().toLowerCase()) && uaFilter != '') {
                if(filter.split('|',2).length > 1) {
                    return res.redirect(filter.split('|',2)[1])
                }
                return res.status(403).json({ error: 'Access denied for this device' })
            }
        }
        next()
    };
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads')
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
})

const upload = multer({ storage })

app.get('/', (req, res) => {
    db.all("SELECT * FROM images", [], (err, rows) => {
        if (err) {
            throw err
        }
        res.render('index', { images: rows })
    })
})

app.post('/upload', upload.single('image'), (req, res) => {
    const filename = req.file.filename
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf-8')
    const password = req.body.password || ''
    const hashedPassword = password ? bcrypt.hashSync(password, 10) : ''

    db.run("INSERT INTO images (filename, originalname, password) VALUES (?, ?, ?)", [filename, originalname, hashedPassword], function(err) {
        if (err) {
            return res.send('Error storing image information.')
        }
        res.redirect('/')
    })
})

app.get('/image/:filename', (req, res) => {
    const filename = req.params.filename

    db.get("SELECT password FROM images WHERE filename = ?", [filename], (err, row) => {
        if (err) {
            return res.send('Error retrieving image information.')
        }
        if (!row || !row.password) {
            res.sendFile(path.join(__dirname, 'public/uploads', filename))
        } else {
            res.render('preview', { filename: filename })
        }
    })
})


app.post('/image/:filename', (req, res) => {
    const { password } = req.body
    const filename = req.params.filename

    db.get("SELECT password FROM images WHERE filename = ?", [filename], (err, row) => {
        if (err) {
            return res.send('Error retrieving image information.')
        }
        if (!row.password || (row.password && bcrypt.compareSync(password, row.password))) {
            res.sendFile(path.join(__dirname, 'public/uploads', filename))
        } else {
            res.send('<script>alert("Incorrect password"); window.history.back();</script>')
        }
    })
})

app.post('/generate-short-url', (req, res) => {
    const { longUrl, uaFilter } = req.body
    const shortUrl = nanoid(7)
    db.run("INSERT INTO images (filename, originalname, password, uploader, upload_time) VALUES (?, ?, ?, ?, ?)",
        [filename, originalname, hashedPassword, uploader, uploadTime],
        function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' })
        }
        res.json({ shortUrl })
    })
})

app.get('/s/:shortUrl', (req, res) => {
    const { shortUrl } = req.params
    db.get(`SELECT longUrl, uaFilter  FROM short_links WHERE shortUrl = ?`, [shortUrl], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' })
        }
        if (row) {
            const { longUrl, uaFilter } = row
            const middleware = checkDevice(uaFilter)
            middleware(req, res, () => {
                if (!res.headersSent) {
                    res.redirect(longUrl)
                }
            })
        } else {
            res.status(404).json({ error: 'Short URL not found' })
        }
    })
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})
