pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('API Lint/Test') {
      agent {
        docker {
          image 'python:3.12-slim'
          args '-u root:root'
        }
      }
      steps {
        dir('apps/api') {
          sh 'pip install -r requirements.txt'
          sh 'python -m compileall src'
        }
      }
    }

    stage('Web Lint/Test') {
      agent {
        docker {
          image 'node:20-alpine'
        }
      }
      steps {
        dir('apps/web') {
          sh 'npm ci || npm install'
          sh 'npm run build'
        }
      }
    }

    stage('Docker Build') {
      steps {
        sh 'docker compose build'
      }
    }
  }
}
