from concurrent.futures import ThreadPoolExecutor
import asyncio
from threading import Barrier
from unittest.mock import patch
from sqlalchemy import select
from sqlalchemy.orm import Session
from src.adapters.db.repositories.exam_repository import SqlAlchemyExamRepository
from src.adapters.db.models.models import ExamModel, ExamFileDeletionModel
from src.adapters.db.exam_cleanup import process_exam_deletions
from src.core.domain.exceptions import NotFoundError
from src.core.use_cases.exam_use_cases import ExamUseCases
from test_exams import ExamFixture, PNG


class ExamDeletionTests(ExamFixture):
    def test_download_survives_real_transactional_delete_and_cleanup_after_headers(self):
        from src.api.routers import exams_router
        from src.adapters.db.exam_maintenance import exam_storage_lock
        exam=self.upload()
        with patch.object(exams_router,'build_use_case',return_value=self.exams_uc), patch.object(exams_router.ClamAVScanner,'scan'):
            response=exams_router.download_exam(exam.id,self.db)
        self.assertFalse(self.db.in_transaction())
        messages=[]
        async def run():
            async def send(message):
                if message['type']=='http.response.start':
                    # Obtaining the lock here also proves streaming does not reserve it.
                    with exam_storage_lock(self.engine), Session(self.engine) as other:
                        self.assertTrue(SqlAlchemyExamRepository(other).delete(exam.id))
                        self.assertEqual(process_exam_deletions(other,self.storage)['removed'],1)
                    self.assertEqual(self.files(),[])
                messages.append(message)
            async def receive(): await asyncio.Event().wait()
            await asyncio.wait_for(response({'type':'http','method':'GET','headers':[]},receive,send),10)
        asyncio.run(run())
        self.assertEqual(b''.join(m.get('body',b'') for m in messages),PNG)
        self.assertTrue(response.stream.closed)

    def test_stale_cached_exam_returns_absence_and_releases_transaction(self):
        exam=self.upload(); cached=self.db.get(ExamModel,exam.id)
        with Session(self.engine) as other:
            self.assertTrue(SqlAlchemyExamRepository(other).delete(exam.id))
        self.assertIsNotNone(cached)
        with self.assertRaises(NotFoundError): self.exams_uc.delete(exam.id)
        self.assertFalse(self.db.in_transaction())
        self.assertEqual(self.files()[0].read_bytes(),PNG)

    def test_queue_failure_rolls_back_all_work(self):
        exam=self.upload()
        from src.adapters.db.exam_cleanup import queue_exam_file
        def queue_then_fail(*args):
            queue_exam_file(*args)
            raise RuntimeError('fictitious queue failure')
        with patch('src.adapters.db.repositories.exam_repository.queue_exam_file',side_effect=queue_then_fail):
            with self.assertRaises(RuntimeError): self.exams_uc.delete(exam.id)
        self.assertFalse(self.db.in_transaction())
        self.assertIsNotNone(self.exams.get(exam.id))
        self.assertEqual(list(self.db.scalars(select(ExamFileDeletionModel))),[])
        self.assertEqual(self.files()[0].read_bytes(),PNG)

    def test_two_deletes_have_one_success_one_not_found_and_one_durable_job(self):
        exam=self.upload(); barrier=Barrier(2,timeout=15)
        def remove():
            with Session(self.engine) as db:
                repo=SqlAlchemyExamRepository(db)
                uc=ExamUseCases(repo,None,self.storage)
                barrier.wait()
                try: uc.delete(exam.id); return 'deleted'
                except NotFoundError:
                    self.assertFalse(db.in_transaction())
                    return 'absent'
        with ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _:remove(),range(2)))
        self.assertCountEqual(results,['deleted','absent'])
        self.assertEqual(len(list(self.db.scalars(select(ExamFileDeletionModel)))),1)
        self.assertEqual(self.files()[0].read_bytes(),PNG)
        self.assertEqual(process_exam_deletions(self.db,self.storage)['removed'],1)
        self.assertEqual(self.files(),[])
