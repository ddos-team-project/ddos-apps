[33mcommit 6d9de4e7763ad3d824731b14f19db8b51aa5c6de[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mfeature/global-rpo-test[m[33m, [m[1;31morigin/feature/global-rpo-test[m[33m)[m
Author: bong-pal <etgt777@naver.com>
Date:   Tue Dec 16 17:44:35 2025 +0900

    fix: merge conflict 해결 (DB info + 리전선택 RPO + Cross-Region 테스트 통합)

[33mcommit c20a1ae4971f61c94cdc351537714cc554052636[m[33m ([m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Merge: 4c4ea07 2ca9f83
Author: Jinhwan <113237390+Jinhwan99@users.noreply.github.com>
Date:   Tue Dec 16 17:35:27 2025 +0900

    Merge pull request #9 from ddos-team-project/revert-8-feature/stress-test-cross-region
    
    Revert "fix: Route53 도메인 수정 (seoul/tokyo.ddos.io.kr)"

[33mcommit 2ca9f83959aba4e606ced55c793a7851776ecd81[m
Author: Jinhwan <113237390+Jinhwan99@users.noreply.github.com>
Date:   Tue Dec 16 17:34:50 2025 +0900

    Revert "fix: Route53 도메인 수정 (seoul/tokyo.ddos.io.kr)"

[33mcommit 4c4ea07d42a19d4a5916077641584a65a47129de[m
Merge: 2c43f40 181ebeb
Author: Jinhwan <113237390+Jinhwan99@users.noreply.github.com>
Date:   Tue Dec 16 17:29:25 2025 +0900

    Merge pull request #8 from ddos-team-project/feature/stress-test-cross-region
    
    fix: Route53 도메인 수정 (seoul/tokyo.ddos.io.kr)

[33mcommit 181ebebfb653028e52953ecabdbc38b428ef8d59[m
Author: JinhwanNoh <xsest55@gmail.com>
Date:   Tue Dec 16 17:28:01 2025 +0900

    fix: Route53 도메인 수정 (seoul/tokyo.ddos.io.kr)

[33mcommit 2c43f4085d191c9e21a454553ebad0c61722a9f0[m
Merge: f8c3b28 fb2c5ae
Author: Jinhwan <113237390+Jinhwan99@users.noreply.github.com>
Date:   Tue Dec 16 17:19:34 2025 +0900

    Merge pull request #7 from ddos-team-project/feature/stress-test-cross-region
    
    리전별 rpo테스트, cross-region 복제 테스트 추가

[33mcommit fb2c5aebbe3e230383ead38ced768d141013b02c[m
Author: JinhwanNoh <xsest55@gmail.com>
Date:   Tue Dec 16 17:15:53 2025 +0900

    feat: Cross-Region 복제 테스트 추가 (Seoul Write → Tokyo Read)
    
    - Seoul Write → Tokyo Read 크로스 리전 복제 지연 측정 기능 추가
    - 프론트엔드에서 Seoul/Tokyo API를 직접 호출하여 복제 지연 측정
    - 평균/최소/최대/중앙값/P95 통계 제공
    - 가이드 테이블에 Cross-Region 테스트 설명 추가

[33mcommit 4a6d112344859f4140ef445119ad13ddf534f58f[m
Author: JinhwanNoh <xsest55@gmail.com>
Date:   Tue Dec 16 17:10:33 2025 +0900

    feat: 리전별 RPO 테스트 및 Tokyo Write 테스트 추가
    
    - api.js: Seoul/Tokyo 전용 API URL 함수 추가
    - StressTest: RPO 테스트에 리전 선택 기능 추가 (Seoul/Tokyo)
    - StressTest: Global RPO → Tokyo Write 테스트로 교체
    - Write Forwarding 동작 확인용 테스트 UI 추가

[33mcommit f8c3b28eae7b7723adc4d724043d42bc13b9ffbf[m
Merge: 9a2e045 e72fbb0
Author: Jinhwan <113237390+Jinhwan99@users.noreply.github.com>
Date:   Tue Dec 16 16:16:36 2025 +0900

    Merge pull request #6 from ddos-team-project/feature/aurora-write-forwarding
    
    크로스리전 복제지연, write forwarding용 세션 변수 추가

[33mcommit e72fbb0b0bf4aea98686fd71b76807975ce91338[m
Author: JinhwanNoh <xsest55@gmail.com>
Date:   Tue Dec 16 16:10:24 2025 +0900

    feat: Aurora Write Forwarding을 위한 세션 변수 설정 추가
    
    - getWriterPool()에서 커넥션 획득 시 aurora_replica_read_consistency='SESSION' 설정
    - Secondary 클러스터에서 Write Forwarding이 정상 동작하도록 함

[33mcommit 5974044a9209716f4a553269f1fcf3356c794af0[m
Author: bong-pal <etgt777@naver.com>
Date:   Tue Dec 16 16:09:29 2025 +0900

    feat: Aurora Global DB 크로스 리전 복제 지연 측정 기능 추가
    
    - Seoul Primary Writer → Tokyo Secondary Reader 복제 측정
    - /global-rpo-test 엔드포인트 추가
    - 프론트엔드 Global RPO 테스트 UI 추가
    - DB_TOKYO_READER_HOST 환경변수 지원

[33mcommit 9a2e0452e69e88eef0d06288770404a678e2a600[m[33m ([m[1;32mmain[m[33m)[m
Author: bong-pal <etgt777@naver.com>
Date:   Tue Dec 16 13:44:48 2025 +0900

    feat: 멀티코어 CPU/DB/RPO 스트레스 테스트 기능 추가
    
    - Worker Threads + crypto.pbkdf2 기반 멀티코어 CPU 부하 테스트
    - DB 스트레스 테스트 (write/read/mixed 모드)
    - Aurora Writer→Reader RPO 복제 지연 측정
    - 프론트엔드 스트레스 테스트 페이지 추가

[33mcommit b80a9677b2cfb0d318cb60ddfcbd11ac7eda5ad5[m
Merge: 11f9ea6 3c8b1f9
Author: 박봉팔 <148850622+Bongpal-dev@users.noreply.github.com>
Date:   Mon Dec 15 22:21:43 2025 +0900

    Merge pull request #4 from ddos-team-project/refactor/routing-test-ui
    
    fix: Docker 컨테이너에 Apache Bench 설치

[33mcommit 3c8b1f97c02c4f31ea431fdd83e721fbda006fd7[m[33m ([m[1;31morigin/refactor/routing-test-ui[m[33m)[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 22:14:50 2025 +0900

    fix: Docker 컨테이너에 Apache Bench 설치

[33mcommit 11f9ea6c3003dba22864b7fa948fec06f2aa8ba5[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 21:08:18 2025 +0900

    fix: 부하테스트 환경변수 ALLOW_STRESS로 통일

[33mcommit d132d09c01e6797104546a6eafd699e7ea952dc7[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 21:08:18 2025 +0900

    fix: 부하테스트 환경변수 ALLOW_STRESS로 통일

[33mcommit 6eb1a350b196e87fe794fc5ea02e7b86fd006931[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 20:07:46 2025 +0900

    feat: 사이드바 메뉴 분리 및 부하 테스트 기능 추가
    
    - React Router 도입으로 페이지 분리
    - 좌측 사이드바 메뉴 추가 (연결 테스트, 부하 테스트)
    - 부하 테스트 페이지 UI 구현
    - healthcheck-api에 /load-test 엔드포인트 추가 (Apache Bench 기반)

[33mcommit bb53ff79fa364d83b660efd3de0bedfa63c49b04[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 18:50:57 2025 +0900

    feat: UI 전체 한글화

[33mcommit d067336e10cb100ce2a4e90549d3e01e78217f6c[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 16:58:16 2025 +0900

    chore: 로그 저장 제한 100 -> 1000개로 증가

[33mcommit e8322b7eaef664f8e4303666bd03277c83016216[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 16:22:57 2025 +0900

    ci: infra-test workflow에 build-test job 추가

[33mcommit d68b34f40b9b88a037be66b5561e9b3a3ba51435[m
Author: bong-pal <etgt777@naver.com>
Date:   Mon Dec 15 15:55:20 2025 +0900

    refactor: RoutingTest 히스토리를 TestLogger로 통합
    
    - RoutingTest 내부 히스토리 테이블 UI 제거
    - TestLogger를 첫 번째 row 아래로 배치
    - 라우팅 테스트 로그가 TestLogger에서 통합 표시

[33mcommit 9303efe99a8f4d004ed8cef1f12d44bf7edcad3f[m
Author: bong-pal <etgt777@naver.com>
Date:   Sun Dec 14 13:59:40 2025 +0900

    chore: 레포 분리 - applications 이관
    
    - healthcheck-api: Node.js 헬스체크 API
    - infra-test: React 인프라 테스트 서비스
    - test-dashboard: React 테스트 대시보드
    - GitHub Actions 워크플로우 경로 수정
