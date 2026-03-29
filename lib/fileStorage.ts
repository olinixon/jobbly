import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export async function saveFile(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    })
    await client.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    }))
    return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileName}`
  } else {
    const uploadDir = process.env.UPLOAD_DIR ?? './uploads'
    const filePath = path.join(uploadDir, fileName)
    await mkdir(uploadDir, { recursive: true })
    await writeFile(filePath, buffer)
    return `/uploads/${fileName}`
  }
}

export async function deleteFile(fileUrl: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL!
    const key = fileUrl.startsWith(publicUrl + '/')
      ? fileUrl.slice(publicUrl.length + 1)
      : fileUrl
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    })
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
    }))
  } else {
    const uploadDir = process.env.UPLOAD_DIR ?? './uploads'
    const fileName = path.basename(fileUrl)
    const filePath = path.join(uploadDir, fileName)
    await unlink(filePath).catch(() => {})
  }
}

