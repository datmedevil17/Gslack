package storage

import (
	"context"
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

// Client wraps the Supabase S3-compatible storage.
type Client struct {
	s3          *s3.Client
	bucket      string
	supabaseURL string // e.g. https://xxx.supabase.co
}

func New(endpoint, accessKeyID, secretKey, bucket, supabaseURL string) *Client {
	cfg := aws.Config{
		Region:      "auto",
		Credentials: credentials.NewStaticCredentialsProvider(accessKeyID, secretKey, ""),
	}
	s3c := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	return &Client{
		s3:          s3c,
		bucket:      bucket,
		supabaseURL: strings.TrimRight(supabaseURL, "/"),
	}
}

// Upload stores a multipart file and returns its storage key and Supabase public URL.
func (c *Client) Upload(ctx context.Context, file multipart.File, header *multipart.FileHeader, folder string) (key, publicURL string, err error) {
	ext := filepath.Ext(header.Filename)
	key = fmt.Sprintf("%s/%s%s", folder, uuid.New().String(), ext)
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err = c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(header.Size),
	})
	if err != nil {
		return "", "", fmt.Errorf("storage upload: %w", err)
	}

	publicURL = c.PublicURL(key)
	return key, publicURL, nil
}

// Delete removes a file by its storage key.
func (c *Client) Delete(ctx context.Context, key string) error {
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	return err
}

// PublicURL returns the Supabase public download URL for a storage key.
func (c *Client) PublicURL(key string) string {
	return fmt.Sprintf("%s/storage/v1/object/public/%s/%s", c.supabaseURL, c.bucket, key)
}
