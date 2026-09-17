pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    // Optional build example. The full PostgreSQL/HTTP suite runs in verify.yml.
    stage('API Compile and Unit Tests') {
      agent {
        docker {
          image 'python:3.12-alpine@sha256:b64631e04e4920160c50fbe8d8df828f7f35f06f425cb44aa09bca53e708a35a'
          args '-u root:root'
        }
      }
      steps {
        dir('apps/api') {
          sh 'pip install --require-hashes --only-binary=:all: -r requirements.txt'
          sh 'python -m compileall src'
          sh 'python -m unittest discover -s tests -p test_dependency_compatibility.py -v'
        }
      }
    }

    stage('Web Tests and Build') {
      agent {
        docker {
          image 'node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81'
        }
      }
      steps {
        dir('apps/web') {
          sh 'npm ci'
          sh 'npm test -- --maxWorkers=1'
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
