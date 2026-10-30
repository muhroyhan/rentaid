FROM golang:1.27.2-alpine AS build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /rentaid ./cmd/rentaid

FROM alpine:3.23
RUN adduser -D -u 10001 rentaid
USER rentaid
COPY --from=build /rentaid /app/rentaid
EXPOSE 8080
CMD ["/app/rentaid", "serve"]
