ssh_key= -i "~/Documents/keys/fontaine-instance.pem"
ssh_host=ec2-user@10.0.103.132
update:
		scp -r $(ssh_key) ./src/*.js $(ssh_host):/mnt/efs/processor/node_modules/LasStreamReader/src/
download:
	scp $(ssh_key) $(ssh_host):/mnt/efs/data/usgs/FL_InlandMonroe_2007/FL_InlandMonroe_2007_000059.laz tests/sample_data/FL_InlandMonroe_2007_000059.laz
